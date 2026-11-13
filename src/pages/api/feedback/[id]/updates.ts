import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { feedbackUser, feedbackFailure, getReview, owns, FeedbackError, text, trackLink } from '@/lib/feedback';
import { sendTemplatedEmail } from '@/lib/emailTemplates';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const user = await feedbackUser(req, res, true);
    const review = await getReview(req.query.id);
    if (!owns(review, user)) throw new FeedbackError('Review not found.', 404);
    const title = text(req.body?.title, 'Update title', 200);
    const detail = text(req.body?.detail, 'Update details', 5000);
    const notify = req.body?.notifyRecipient;
    if (notify !== undefined && typeof notify !== 'boolean') throw new FeedbackError('Invalid notification preference.');
    if (notify === true && !review.work.recipientEmail) throw new FeedbackError('Private reviews do not send student emails.');
    await prisma.feedbackEvent.create({ data: { reviewId: review.id, type: 'MANUAL_UPDATE',
      message: JSON.stringify({ title, detail, stage: review.status }) } });
    let warning: string | undefined;
    if (notify === true && review.work.recipientEmail) {
      try {
        await sendTemplatedEmail(review.work.recipientEmail, 'feedback_manual_update', {
          recipientName: review.work.recipientName, supervisorName: review.work.supervisor.name || 'Your supervisor',
          workTitle: review.work.title, version: review.version, updateTitle: title, updateDetail: detail,
          actionUrl: trackLink(review.trackingToken),
        });
      } catch { warning = 'Update saved, but the email notification failed. The update is still available on the tracking page.'; }
    }
    return res.status(201).json({ warning });
  } catch (error) { return feedbackFailure(res, error); }
}
