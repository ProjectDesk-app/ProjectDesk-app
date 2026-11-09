import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { feedbackUser, feedbackFailure, FeedbackError } from '@/lib/feedback';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST'); return res.status(405).end();
  }
  try {
    if (req.method === 'GET') {
      const user = await feedbackUser(req, res);
      const reviewId = req.query.reviewId === undefined ? undefined : Number(req.query.reviewId);
      const cursor = req.query.cursor === undefined ? undefined : Number(req.query.cursor);
      if ((reviewId !== undefined && (!Number.isSafeInteger(reviewId) || reviewId <= 0)) ||
          (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor <= 0))) throw new FeedbackError('Invalid log request.');
      // Ownership is applied to every query, including pagination and totals.
      const where = { review: { work: { supervisorId: user.id } }, ...(reviewId ? { reviewId } : {}) };
      const [total, identified, reviewsViewed, rows] = await Promise.all([
        prisma.feedbackPageView.count({ where }),
        prisma.feedbackPageView.count({ where: { ...where, kind: 'RECIPIENT' } }),
        prisma.feedbackPageView.groupBy({ by: ['reviewId'], where }),
        prisma.feedbackPageView.findMany({
          where: { ...where, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: 'desc' }, take: 51,
          select: { id: true, kind: true, source: true, recipientName: true, createdAt: true,
            review: { select: { version: true, work: { select: { title: true } } } } },
        }),
      ]);
      return res.json({ total, identified, anonymous: total - identified, reviewsViewed: reviewsViewed.length,
        views: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null });
    }
    // Browser-only POST avoids counting link previews, prefetches and SWR refreshes.
    const origin = req.headers.origin;
    if (!origin || origin !== new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin) throw new FeedbackError('Invalid request origin.', 403);
    const { token, reviewId, viewId, source } = req.body || {};
    if (typeof viewId !== 'string' || !/^[a-f0-9-]{36}$/i.test(viewId) ||
        !['TRACKING', 'HUB'].includes(source)) throw new FeedbackError('Invalid view.');
    if (source === 'TRACKING' ? typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) : !Number.isSafeInteger(reviewId) || reviewId <= 0) throw new FeedbackError('Invalid review.');
    const session = await getServerSession(req, res, authOptions as any) as any;
    const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: Number(session.user.id) } }) : null;
    const review = await prisma.feedbackReview.findUnique({
      where: source === 'TRACKING' ? { trackingToken: token } : { id: reviewId }, include: { work: true },
    });
    if (!review || !review.work.recipientEmail) throw new FeedbackError('Review not found.', 404);
    if (user?.id === review.work.supervisorId) return res.status(204).end();
    const identified = Boolean(user?.emailVerified && user.email.toLowerCase() === review.work.recipientEmail.toLowerCase());
    if (source === 'HUB' && !identified) throw new FeedbackError('Review not found.', 404);
    // Retrying the same page open cannot create duplicate rows.
    await prisma.feedbackPageView.createMany({ data: [{ reviewId: review.id, viewId, source,
      kind: identified ? 'RECIPIENT' : 'ANONYMOUS', recipientName: identified ? review.work.recipientName : null }], skipDuplicates: true });
    return res.status(204).end();
  } catch (error) { return feedbackFailure(res, error); }
}
