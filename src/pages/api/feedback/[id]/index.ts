import { feedbackQueueMap } from '@/lib/feedbackQueue';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addWorkingDays, calendarDate, ukToday, validateRange, workingDaysBetween, formatFeedbackDateRange } from '@/lib/feedbackDates';
import { feedbackUser, feedbackFailure, getReview, canRead, owns, canManageFeedback, serializeReview, reviewInclude, feedbackStatuses, terminal, FeedbackError, sendReviewEmail, trackLink, text } from '@/lib/feedback';
import { sendTemplatedEmail } from '@/lib/emailTemplates';
import { randomBytes } from 'crypto';
import { isEmailBlocked } from '@/lib/blockedEmails';
import { feedbackHolidays } from '@/lib/feedbackHolidays';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await feedbackUser(req, res, req.method === 'PATCH' || req.method === 'DELETE');
    const review = await getReview(req.query.id);
    if (!canRead(review, user)) throw new FeedbackError('Review not found.', 404);
    if (req.method === 'GET') return res.json({ review: await serializeReview(review, user, (await feedbackQueueMap([review.work.supervisorId])).get(review.id)) });
    if (req.method !== 'PATCH' && req.method !== 'DELETE') { res.setHeader('Allow', 'GET, PATCH, DELETE'); return res.status(405).end(); }
    if (!owns(review, user) || !canManageFeedback(user)) throw new FeedbackError('Access denied.', 403);
    if (req.method === 'DELETE') {
      await prisma.$transaction(async tx => {
        await tx.feedbackEvent.deleteMany({ where: { reviewId: review.id } });
        await tx.feedbackReview.delete({ where: { id: review.id } });
        // Keep other versions and their version numbering intact.
        await tx.feedbackWork.deleteMany({ where: { id: review.workId, reviews: { none: {} } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return res.status(204).end();
    }
    const body = req.body || {};
    if (body.title !== undefined) {
      if (Object.keys(body).some(key => key !== 'title')) throw new FeedbackError('Save title changes separately.');
      const title = text(body.title, 'Work title');
      await prisma.feedbackWork.update({ where: { id: review.workId }, data: { title } });
      return res.json({ review: await serializeReview(await getReview(review.id), user, (await feedbackQueueMap([review.work.supervisorId])).get(review.id)) });
    }
    if (body.retryEmail) {
      if (!review.work.recipientEmail) throw new FeedbackError('Private reviews do not send emails.');
      if (!['receipt', 'completion'].includes(body.retryEmail) || (body.retryEmail === 'completion' && !review.completedAt)) throw new FeedbackError('Invalid email retry.');
      let warning: string | undefined;
      try { await sendReviewEmail(review.id, body.retryEmail); } catch { warning = 'Email delivery failed. Please try again later.'; }
      return res.json({ review: await serializeReview(await getReview(review.id), user, (await feedbackQueueMap([review.work.supervisorId])).get(review.id)), warning });
    }
    if (!review.work.recipientEmail && body.recipientEmail !== undefined) throw new FeedbackError('Private reviews cannot be linked to a recipient.');
    const correctedName = body.recipientName === undefined ? review.work.recipientName : text(body.recipientName, 'Recipient name');
    const correctedEmail = body.recipientEmail === undefined ? review.work.recipientEmail : text(body.recipientEmail, 'Recipient email', 254).toLowerCase();
    if (correctedEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correctedEmail)) throw new FeedbackError('Enter a valid recipient email.');
    if (correctedEmail && correctedEmail !== review.work.recipientEmail && await isEmailBlocked(correctedEmail)) throw new FeedbackError('This recipient email cannot be used.', 403);
    if (body.status !== undefined && !feedbackStatuses.includes(body.status)) throw new FeedbackError('Invalid review status.');
    const estimateStart = body.estimateStart === undefined ? review.estimateStart : calendarDate(body.estimateStart);
    let estimateEnd = body.estimateEnd === undefined ? review.estimateEnd : calendarDate(body.estimateEnd);
    if (body.paused !== undefined && typeof body.paused !== 'boolean') throw new FeedbackError('Invalid pause preference.');
    if (body.pauseDays !== undefined && (body.paused !== true || !Number.isInteger(body.pauseDays) || body.pauseDays < 0 || body.pauseDays > 730)) throw new FeedbackError('Enter a pause estimate between 0 and 730 working days.');
    if (body.paused === true && !review.paused && body.pauseDays) {
      estimateEnd = addWorkingDays(review.estimateEnd, body.pauseDays, await feedbackHolidays(review.estimateEnd));
      await feedbackHolidays(review.estimateEnd, estimateEnd);
    }
    validateRange(estimateStart, estimateEnd, review.receivedDate);
    if (body.notifyRecipient !== undefined && typeof body.notifyRecipient !== 'boolean') throw new FeedbackError('Invalid notification preference.');
    let completionTurnaround: number | null = null;
    let calendarWarning: string | undefined;
    if (body.status === 'COMPLETED' && review.status !== 'COMPLETED') {
      try { completionTurnaround = workingDaysBetween(review.receivedDate, ukToday(), await feedbackHolidays(review.receivedDate, ukToday())); }
      catch { calendarWarning = 'Review completed, but working-day turnaround could not be calculated because the bank-holiday calendar is unavailable.'; }
    }
    let newlyPaused = false;
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.feedbackReview.findUniqueOrThrow({ where: { id: review.id } });
      if (body.recipientName !== undefined || body.recipientEmail !== undefined) {
        await tx.feedbackWork.update({ where: { id: review.workId }, data: { recipientName: correctedName, recipientEmail: correctedEmail } });
        if (correctedEmail !== review.work.recipientEmail) {
          const versions = await tx.feedbackReview.findMany({ where: { workId: review.workId } });
          for (const version of versions) await tx.feedbackReview.update({ where: { id: version.id }, data: { trackingToken: randomBytes(32).toString('hex'), ...(version.id === review.id ? { receiptEmailSentAt: null, receiptEmailClaimedAt: null } : {}), history: { create: { type: 'RECIPIENT_CORRECTED', message: 'Recipient details corrected; previous tracking link revoked.' } } } });
        }
      }
      const status = body.status || current.status;
      if (terminal(current.status) && !terminal(status) && body.reopenConfirmed !== true) throw new FeedbackError('Confirm reopening this review.');
      const resuming = current.paused && (body.paused === false || status !== current.status);
      if (body.paused === true && (terminal(current.status) || terminal(status))) throw new FeedbackError('Only an outstanding review can be paused.');
      if (resuming && (body.estimateConfirmed !== true || body.estimateStart === undefined || body.estimateEnd === undefined)) throw new FeedbackError('Reconfirm the estimated return dates before resuming or completing this review.');
      if (body.paused === true && status !== current.status) throw new FeedbackError('Pause the current stage before changing stages.');
      const data: any = {};
      if (body.paused !== undefined || resuming) data.paused = resuming ? false : body.paused;
      const events: { type: string; message: string }[] = [];
      newlyPaused = body.paused === true && !current.paused;
      if (newlyPaused) events.push({ type: `PAUSED_${current.status}`, message: `Process Paused.${body.pauseDays !== undefined ? ` Estimated pause: ${body.pauseDays} working days.` : ''}` });
      if (resuming) events.push({ type: 'RESUMED', message: 'Review resumed; estimated return dates reconfirmed.' });
      if (status !== current.status) {
        data.status = status;
        if (terminal(current.status) || terminal(status)) data.queuePosition = null;
        data.completedAt = status === 'COMPLETED' ? new Date() : null;
        data.turnaroundWorkingDays = status === 'COMPLETED' ? completionTurnaround : null;
        data.cancellationReason = status === 'CANCELLED' ? text(body.cancellationReason, 'Cancellation reason', 1000) : null;
        events.push({ type: status, message: status === 'CANCELLED' ? data.cancellationReason : `Status changed to ${status.replace(/_/g, ' ').toLowerCase()}.` });
      }
      if ((body.estimateStart !== undefined || body.estimateEnd !== undefined || body.paused === true) && (estimateStart !== current.estimateStart || estimateEnd !== current.estimateEnd)) {
        data.estimateStart = estimateStart; data.estimateEnd = estimateEnd;
        events.push({ type: 'ESTIMATE_CHANGED', message: `Estimate changed from ${current.estimateStart} – ${current.estimateEnd} to ${estimateStart} – ${estimateEnd}.` });
      }
      return tx.feedbackReview.update({ where: { id: review.id }, data: { ...data, history: { create: events } }, include: reviewInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let warning: string | undefined = calendarWarning;
    try {
      if (newlyPaused && updated.work.recipientEmail) await sendTemplatedEmail(updated.work.recipientEmail, 'feedback_paused', {
        recipientName: updated.work.recipientName, workTitle: updated.work.title, version: updated.version,
        supervisorName: updated.work.supervisor.name || 'Your supervisor', actionUrl: trackLink(updated.trackingToken),
      });
      if (updated.status === 'COMPLETED' && updated.work.recipientEmail) await sendReviewEmail(updated.id, 'completion');
      if (updated.work.recipientEmail && body.paused === undefined && !review.paused && body.notifyRecipient === true && (updated.estimateStart !== review.estimateStart || updated.estimateEnd !== review.estimateEnd)) await sendTemplatedEmail(updated.work.recipientEmail, 'feedback_estimate_updated', {
        recipientName: updated.work.recipientName, workTitle: updated.work.title, version: updated.version,
        supervisorName: updated.work.supervisor.name || 'Your supervisor',
        estimatedRange: formatFeedbackDateRange(updated.estimateStart, updated.estimateEnd), actionUrl: trackLink(updated.trackingToken),
      });
    } catch { warning = 'Changes saved, but email delivery failed.'; }
    return res.json({ review: await serializeReview(await getReview(updated.id), user, (await feedbackQueueMap([updated.work.supervisorId])).get(updated.id)), warning });
  } catch (error) { return feedbackFailure(res, error); }
}
