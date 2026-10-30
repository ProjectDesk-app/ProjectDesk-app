import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calendarDate, ukToday, validateRange, workingDaysBetween } from '@/lib/feedbackDates';
import { feedbackUser, feedbackFailure, getReview, canRead, owns, canManageFeedback, serializeReview, reviewInclude, feedbackStatuses, terminal, FeedbackError, sendReviewEmail, trackLink, text } from '@/lib/feedback';
import { sendEmail } from '@/lib/mailer';
import { randomBytes } from 'crypto';
import { isEmailBlocked } from '@/lib/blockedEmails';
import { feedbackHolidays } from '@/lib/feedbackHolidays';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await feedbackUser(req, res, req.method === 'PATCH');
    const review = await getReview(req.query.id);
    if (!canRead(review, user)) throw new FeedbackError('Review not found.', 404);
    if (req.method === 'GET') return res.json({ review: await serializeReview(review, user) });
    if (req.method !== 'PATCH') { res.setHeader('Allow', 'GET, PATCH'); return res.status(405).end(); }
    if (!owns(review, user) || !canManageFeedback(user)) throw new FeedbackError('Access denied.', 403);
    const body = req.body || {};
    if (body.retryEmail) {
      if (!['receipt', 'completion'].includes(body.retryEmail) || (body.retryEmail === 'completion' && !review.completedAt)) throw new FeedbackError('Invalid email retry.');
      let warning: string | undefined;
      try { await sendReviewEmail(review.id, body.retryEmail); } catch { warning = 'Email delivery failed. Please try again later.'; }
      return res.json({ review: await serializeReview(await getReview(review.id), user), warning });
    }
    const correctedName = body.recipientName === undefined ? review.work.recipientName : text(body.recipientName, 'Recipient name');
    const correctedEmail = body.recipientEmail === undefined ? review.work.recipientEmail : text(body.recipientEmail, 'Recipient email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correctedEmail)) throw new FeedbackError('Enter a valid recipient email.');
    if (correctedEmail !== review.work.recipientEmail && await isEmailBlocked(correctedEmail)) throw new FeedbackError('This recipient email cannot be used.', 403);
    if (body.status !== undefined && !feedbackStatuses.includes(body.status)) throw new FeedbackError('Invalid review status.');
    const estimateStart = body.estimateStart === undefined ? review.estimateStart : calendarDate(body.estimateStart);
    const estimateEnd = body.estimateEnd === undefined ? review.estimateEnd : calendarDate(body.estimateEnd);
    validateRange(estimateStart, estimateEnd, review.receivedDate);
    if (body.notifyRecipient !== undefined && typeof body.notifyRecipient !== 'boolean') throw new FeedbackError('Invalid notification preference.');
    let completionTurnaround: number | null = null;
    let calendarWarning: string | undefined;
    if (body.status === 'COMPLETED' && review.status !== 'COMPLETED') {
      try { completionTurnaround = workingDaysBetween(review.receivedDate, ukToday(), await feedbackHolidays(review.receivedDate, ukToday())); }
      catch { calendarWarning = 'Review completed, but working-day turnaround could not be calculated because the bank-holiday calendar is unavailable.'; }
    }
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
      const data: any = {};
      const events: { type: string; message: string }[] = [];
      if (status !== current.status) {
        data.status = status;
        data.completedAt = status === 'COMPLETED' ? new Date() : null;
        data.turnaroundWorkingDays = status === 'COMPLETED' ? completionTurnaround : null;
        data.cancellationReason = status === 'CANCELLED' ? text(body.cancellationReason, 'Cancellation reason', 1000) : null;
        events.push({ type: status, message: status === 'CANCELLED' ? data.cancellationReason : `Status changed to ${status.replace(/_/g, ' ').toLowerCase()}.` });
      }
      if ((body.estimateStart !== undefined || body.estimateEnd !== undefined) && (estimateStart !== current.estimateStart || estimateEnd !== current.estimateEnd)) {
        data.estimateStart = estimateStart; data.estimateEnd = estimateEnd;
        events.push({ type: 'ESTIMATE_CHANGED', message: `Estimate changed from ${current.estimateStart} – ${current.estimateEnd} to ${estimateStart} – ${estimateEnd}.` });
      }
      return tx.feedbackReview.update({ where: { id: review.id }, data: { ...data, history: { create: events } }, include: reviewInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let warning: string | undefined = calendarWarning;
    try {
      if (updated.status === 'COMPLETED') await sendReviewEmail(updated.id, 'completion');
      if (body.notifyRecipient === true && (updated.estimateStart !== review.estimateStart || updated.estimateEnd !== review.estimateEnd)) await sendEmail(updated.work.recipientEmail, `Feedback estimate updated: ${updated.work.title}`, `Hello ${updated.work.recipientName},\n\nYour estimated feedback return for ${updated.work.title} (V${updated.version}) is now ${updated.estimateStart} to ${updated.estimateEnd}.\n\nTrack Progress:\n${trackLink(updated.trackingToken)}`);
    } catch { warning = 'Changes saved, but email delivery failed.'; }
    return res.json({ review: await serializeReview(await getReview(updated.id), user), warning });
  } catch (error) { return feedbackFailure(res, error); }
}
