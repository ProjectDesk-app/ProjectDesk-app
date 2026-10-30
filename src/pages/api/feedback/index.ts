import type { NextApiRequest, NextApiResponse } from 'next';
import { isEmailBlocked } from '@/lib/blockedEmails';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calendarDate, ukToday, validateRange } from '@/lib/feedbackDates';
import { feedbackUser, feedbackFailure, canManageFeedback, serializeReview, reviewInclude, text, dayCount, estimate, terminal, FeedbackError, sendReviewEmail } from '@/lib/feedback';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await feedbackUser(req, res, req.method === 'POST');
    if (req.method === 'GET') {
      const reviews = await prisma.feedbackReview.findMany({ where: { work: { OR: [{ supervisorId: user.id }, { recipientEmail: { equals: user.email, mode: 'insensitive' } }] } }, include: reviewInclude, orderBy: [{ estimateEnd: 'asc' }, { id: 'desc' }] });
      return res.json({ reviews: await Promise.all(reviews.map(r => serializeReview(r, user))), canManage: canManageFeedback(user) });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
    const body = req.body || {};
    const receivedDate = calendarDate(body.receivedDate || ukToday());
    if (receivedDate > ukToday()) throw new FeedbackError('Receipt date cannot be in the future.');
    const dates = body.estimateStart && body.estimateEnd ? { estimateStart: calendarDate(body.estimateStart), estimateEnd: calendarDate(body.estimateEnd) } : await estimate(receivedDate, dayCount(body.minDays), dayCount(body.maxDays));
    validateRange(dates.estimateStart, dates.estimateEnd, receivedDate);
    let title: string, recipientName: string, recipientEmail: string, workType: string;
    if (!body.workId) {
      title = text(body.title, 'Work title'); recipientName = text(body.recipientName, 'Recipient name'); recipientEmail = text(body.recipientEmail, 'Recipient email', 254).toLowerCase(); workType = text(body.workType, 'Work type', 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new FeedbackError('Enter a valid recipient email.');
      if (await isEmailBlocked(recipientEmail)) throw new FeedbackError('This recipient email cannot be used.', 403);
    }
    const review = await prisma.$transaction(async tx => {
      let work;
      if (body.workId) {
        const id = Number(body.workId); if (!Number.isSafeInteger(id)) throw new FeedbackError('Invalid work record.');
        work = await tx.feedbackWork.findFirst({ where: { id, supervisorId: user.id } });
        if (!work) throw new FeedbackError('Work not found.', 404);
        const active = await tx.feedbackReview.findMany({ where: { workId: work.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } } });
        if (active.length && !['keep', 'supersede'].includes(body.previousAction)) throw new FeedbackError('Choose whether to keep or supersede the active review.', 409);
        if (active.length && body.previousAction === 'supersede') {
          for (const previous of active) await tx.feedbackReview.update({ where: { id: previous.id }, data: { status: 'CANCELLED', cancellationReason: 'Superseded by a new version', history: { create: { type: 'CANCELLED', message: 'Superseded by a new version' } } } });
        }
      } else work = await tx.feedbackWork.create({ data: { supervisorId: user.id, title, recipientName, recipientEmail, workType } });
      // Atomic counter plus unique constraint protects version numbers even under concurrency.
      const counter = await tx.feedbackWork.update({ where: { id: work.id }, data: { nextVersion: { increment: 1 } } });
      return tx.feedbackReview.create({ data: { workId: work.id, version: counter.nextVersion - 1, receivedDate, ...dates, trackingToken: randomBytes(32).toString('hex'), history: { create: { type: 'RECEIVED', message: `Received and queued. Estimated return: ${dates.estimateStart} to ${dates.estimateEnd}.` } } }, include: reviewInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let warning: string | undefined;
    try { await sendReviewEmail(review.id, 'receipt'); } catch { warning = 'Review saved, but the receipt email failed. You can retry it from the review.'; }
    return res.status(201).json({ review: await serializeReview(review, user), warning });
  } catch (error) { return feedbackFailure(res, error); }
}
