import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { feedbackQueueMap } from '@/lib/feedbackQueue';
import { feedbackUser, feedbackFailure, getReview, owns, FeedbackError, reviewInclude, serializeReview } from '@/lib/feedback';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    const user = await feedbackUser(req, res, true);
    const selected = await getReview(req.query.id);
    if (!owns(selected, user) || !selected.work.recipientEmail) throw new FeedbackError('Review not found.', 404);
    // A supervisor may preview only their own shared work, never another supervisor's records.
    const reviews = await prisma.feedbackReview.findMany({
      where: { work: { supervisorId: user.id, recipientEmail: { equals: selected.work.recipientEmail, mode: 'insensitive' } } },
      include: reviewInclude, orderBy: [{ estimateEnd: 'asc' }, { id: 'desc' }],
    });
    const queue = await feedbackQueueMap([user.id]);
    // Projection only: no login, session change, user lookup, writes or notification calls.
    const recipientPerspective = { id: 0, email: selected.work.recipientEmail };
    return res.json({
      reviews: await Promise.all(reviews.map(review => serializeReview(review, recipientPerspective, queue.get(review.id)))),
      canManage: false, preview: { recipientName: selected.work.recipientName, recipientEmail: selected.work.recipientEmail },
    });
  } catch (error) { return feedbackFailure(res, error); }
}
