import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { feedbackUser, feedbackFailure, FeedbackError } from '@/lib/feedback';
import { orderFeedbackQueue } from '@/lib/feedbackQueue';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const user = await feedbackUser(req, res, true);
    const body = req.body || {};
    const reset = body.reset === true;
    if (!reset && (!Number.isSafeInteger(body.reviewId) || body.reviewId < 1 || !Number.isSafeInteger(body.position) || body.position < 1)) {
      throw new FeedbackError('Choose a review and a whole-number queue position.');
    }
    if (reset && (body.reviewId !== undefined || body.position !== undefined)) {
      throw new FeedbackError('Choose either a queue move or receipt-date order.');
    }
    await prisma.$transaction(async tx => {
      const active = await tx.feedbackReview.findMany({
        where: { work: { supervisorId: user.id }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        select: { id: true, receivedDate: true, createdAt: true, queuePosition: true },
      });
      if (reset) {
        const changed = active.filter(row => row.queuePosition !== null);
        if (!changed.length) return;
        await tx.feedbackReview.updateMany({
          where: { id: { in: changed.map(row => row.id) }, work: { supervisorId: user.id } },
          data: { queuePosition: null },
        });
        await tx.feedbackEvent.createMany({ data: changed.map(row => ({ reviewId: row.id, type: 'QUEUE_CHANGED', message: 'Supervisor restored receipt-date queue order.' })) });
        return;
      }
      const ordered = orderFeedbackQueue(active);
      const index = ordered.findIndex(row => row.id === body.reviewId);
      if (index < 0) throw new FeedbackError('Active review not found.', 404);
      if (body.position > ordered.length) throw new FeedbackError(`Choose a queue position between 1 and ${ordered.length}.`);
      if (body.position === index + 1) return;
      const [review] = ordered.splice(index, 1);
      ordered.splice(body.position - 1, 0, review);
      for (const [position, row] of Array.from(ordered.entries())) {
        await tx.feedbackReview.update({ where: { id: row.id }, data: { queuePosition: position + 1 } });
      }
      await tx.feedbackEvent.create({ data: { reviewId: review.id, type: 'QUEUE_CHANGED', message: 'Queue position adjusted by supervisor.' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.json({ message: reset ? 'Receipt-date queue order restored.' : 'Queue position updated.' });
  } catch (error) {
    return feedbackFailure(res, error);
  }
}
