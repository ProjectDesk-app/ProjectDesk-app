import { feedbackQueueMap } from '@/lib/feedbackQueue';
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { publicReview, reviewInclude, feedbackFailure } from '@/lib/feedback';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  if (typeof req.query.token !== 'string' || !/^[a-f0-9]{64}$/.test(req.query.token)) return res.status(404).json({ error: 'Tracking link not found.' });
  try {
    const review = await prisma.feedbackReview.findUnique({ where: { trackingToken: req.query.token }, include: reviewInclude });
    if (!review) return res.status(404).json({ error: 'Tracking link not found.' });
    return res.json({ review: publicReview(review, (await feedbackQueueMap([review.work.supervisorId])).get(review.id)) });
  } catch (error) { return feedbackFailure(res, error); }
}
