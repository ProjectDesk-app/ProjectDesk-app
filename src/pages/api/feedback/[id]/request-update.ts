import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { feedbackUser, feedbackFailure, getReview, owns, canRead, terminal, FeedbackError, serializeReview } from '@/lib/feedback';
import { addWorkingDays, ukToday, shiftDay } from '@/lib/feedbackDates';
import { feedbackHolidays } from '@/lib/feedbackHolidays';
import { sendEmail } from '@/lib/mailer';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
    const user = await feedbackUser(req, res), review = await getReview(req.query.id);
    if (!canRead(review, user) || owns(review, user)) throw new FeedbackError('Review not found.', 404);
    const today = ukToday(), holidays = await feedbackHolidays(review.lastRequestDate || today, shiftDay(today, 14));
    if (terminal(review.status) || review.estimateEnd >= today) throw new FeedbackError('Update requests are available only for overdue reviews.');
    if (review.lastRequestDate && addWorkingDays(review.lastRequestDate, 5, holidays) > today) throw new FeedbackError('Please wait five working days between update requests.', 429);
    const claim = await prisma.feedbackReview.updateMany({ where: { id: review.id, lastRequestDate: review.lastRequestDate, status: { notIn: ['COMPLETED', 'CANCELLED'] }, estimateEnd: { lt: today } }, data: { lastRequestDate: today } });
    if (!claim.count) throw new FeedbackError('This review has changed. Please refresh before requesting an update.', 409);
    try {
      await sendEmail(review.work.supervisor.email, `Feedback update requested: ${review.work.title}`, `${user.name || review.work.recipientName} has requested an update on overdue feedback for ${review.work.title} (V${review.version}).\n\nEstimated return: ${review.estimateStart} to ${review.estimateEnd}.\n\nOpen Feedback Hub: ${(process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')}/feedback`);
    } catch {
      await prisma.feedbackReview.updateMany({ where: { id: review.id, lastRequestDate: today }, data: { lastRequestDate: review.lastRequestDate } });
      return res.status(502).json({ error: 'The reminder email could not be sent. Please try again.' });
    }
    await prisma.feedbackEvent.create({ data: { reviewId: review.id, type: 'UPDATE_REQUESTED', message: 'Recipient requested an overdue feedback update.' } });
    return res.json({ review: await serializeReview(await getReview(review.id), user) });
  } catch (error) { return feedbackFailure(res, error); }
}
