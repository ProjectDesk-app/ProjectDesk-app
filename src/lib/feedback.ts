import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { addWorkingDays, ukToday, workingDaysBetween, shiftDay } from './feedbackDates';
import { FeedbackDateError } from './feedbackDates';
import { FeedbackHolidayError, feedbackHolidays } from './feedbackHolidays';
import type { NextApiRequest, NextApiResponse } from 'next';
export const feedbackStatuses = ['RECEIVED', 'INITIAL_READING', 'FULL_REVIEW', 'FINALISING', 'COMPLETED', 'CANCELLED'];
export const terminal = (status: string) => ['COMPLETED', 'CANCELLED'].includes(status);
export class FeedbackError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function canManageFeedback(user: any) {
  if (user?.role === 'ADMIN') return true;
  if (user?.role !== 'SUPERVISOR') return false;
  if (['SUBSCRIBED', 'ADMIN_APPROVED'].includes(user.subscriptionType)) return true;
  return user.subscriptionType === 'FREE_TRIAL' && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) >= new Date());
}
export async function feedbackUser(req: NextApiRequest, res: NextApiResponse, manage = false) {
  res.setHeader('Cache-Control', 'private, no-store');
  const session = await getServerSession(req, res, authOptions as any) as any;
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: Number(session.user.id) } }) : null;
  if (!user?.emailVerified) throw new FeedbackError('Sign in with a verified email address.', 401);
  if (manage && !canManageFeedback(user)) throw new FeedbackError('An active supervisor account is required.', 403);
  return user;
}
export function feedbackFailure(res: NextApiResponse, error: unknown) {
  if (error instanceof FeedbackDateError) return res.status(400).json({ error: error.message });
  if (error instanceof FeedbackHolidayError) return res.status(503).json({ error: error.message });
  if ((error as any)?.code === 'P2034') return res.status(409).json({ error: 'This record changed while saving. Please refresh and try again.' });
  if (error instanceof FeedbackError) return res.status(error.status).json({ error: error.message });
  console.error('Feedback Hub:', error);
  return res.status(500).json({ error: 'Unable to process this feedback request. Please try again.' });
}
export const reviewInclude = { work: { include: { supervisor: { select: { name: true, email: true } } } }, history: { orderBy: { id: 'asc' as const } } };
export async function getReview(id: unknown) {
  const value = Number(id); if (!Number.isSafeInteger(value) || value <= 0) throw new FeedbackError('Review not found.', 404);
  const review = await prisma.feedbackReview.findUnique({ where: { id: value }, include: reviewInclude });
  if (!review) throw new FeedbackError('Review not found.', 404); return review;
}
export function owns(review: any, user: any) { return review.work.supervisorId === user.id; }
export function canRead(review: any, user: any) { return owns(review, user) || review.work.recipientEmail.toLowerCase() === user.email.toLowerCase(); }
export async function serializeReview(review: any, user?: any) {
  const owner = user && owns(review, user), today = ukToday();
  let nextRequestDate: string | null = null, turnaroundWorkingDays: number | null = review.turnaroundWorkingDays ?? null;
  let calendarWarning: string | undefined;
  try {
    const end = review.completedAt ? ukToday(new Date(review.completedAt)) : shiftDay(today, 14);
    const holidays = await feedbackHolidays(review.receivedDate, end);
    if (review.lastRequestDate) nextRequestDate = addWorkingDays(review.lastRequestDate, 5, holidays);
    if (review.completedAt && turnaroundWorkingDays === null) turnaroundWorkingDays = workingDaysBetween(review.receivedDate, ukToday(new Date(review.completedAt)), holidays);
  } catch { calendarWarning = 'Working-day information is temporarily unavailable.'; }
  const overdue = !terminal(review.status) && review.estimateEnd < today;
  return { id: review.id, workId: review.workId, title: review.work.title, recipientName: review.work.recipientName, recipientEmail: review.work.recipientEmail, workType: review.work.workType, version: review.version, status: review.status, receivedDate: review.receivedDate, estimateStart: review.estimateStart, estimateEnd: review.estimateEnd, completedAt: review.completedAt, cancellationReason: review.cancellationReason, supervisorName: review.work.supervisor.name || 'Your supervisor', isOwner: Boolean(owner), ...(owner ? { trackingToken: review.trackingToken, receiptEmailSentAt: review.receiptEmailSentAt, completionEmailSentAt: review.completionEmailSentAt } : {}), history: review.history, overdue, canRequestUpdate: Boolean(user && !owner && overdue && !calendarWarning && (!nextRequestDate || nextRequestDate <= today)), nextRequestDate, turnaroundWorkingDays, calendarWarning };
}
export function publicReview(review: any) {
  return { title: review.work.title, version: review.version, supervisorName: review.work.supervisor.name || 'Your supervisor', status: review.status, receivedDate: review.receivedDate, estimateStart: review.estimateStart, estimateEnd: review.estimateEnd, completedAt: review.completedAt, cancellationReason: review.cancellationReason, overdue: !terminal(review.status) && review.estimateEnd < ukToday() };
}
export function text(value: unknown, label: string, max = 200) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new FeedbackError(`${label} is required (up to ${max} characters).`); return value.trim(); }
export function dayCount(value: unknown) { if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 730) throw new FeedbackError('Enter whole working-day estimates between 1 and 730.'); return value; }
export async function estimate(received: string, min: number, max: number) {
  if (max < min) throw new FeedbackError('The maximum estimate must be at least the minimum.');
  const holidays = await feedbackHolidays(received);
  const result = { estimateStart: addWorkingDays(received, min, holidays), estimateEnd: addWorkingDays(received, max, holidays) };
  await feedbackHolidays(received, result.estimateEnd);
  return result;
}
export function trackLink(token: string) { return `${(process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')}/feedback/track/${token}`; }
// A conditional DB claim prevents concurrent requests from sending duplicate emails.
// Provider failures release the claim so the owner can retry explicitly.
export async function sendReviewEmail(id: number, kind: 'receipt' | 'completion') {
  const claimedField = kind === 'receipt' ? 'receiptEmailClaimedAt' : 'completionEmailClaimedAt';
  const sentField = kind === 'receipt' ? 'receiptEmailSentAt' : 'completionEmailSentAt';
  const claim = await prisma.feedbackReview.updateMany({ where: { id, [claimedField]: null, [sentField]: null }, data: { [claimedField]: new Date() } });
  if (!claim.count) return;
  try {
    const review = await getReview(id);
    const receipt = kind === 'receipt';
    await sendEmail(review.work.recipientEmail, receipt ? `Work received: ${review.work.title} (V${review.version})` : `Feedback returned: ${review.work.title} (V${review.version})`, `Hello ${review.work.recipientName},\n\n${receipt ? 'Your work has been received and queued for review.' : 'Your supervisor has confirmed that your feedback has been returned separately.'}\n\n${review.work.title} — V${review.version}\nSupervisor: ${review.work.supervisor.name || 'Your supervisor'}\n${receipt ? `Estimated feedback return: ${review.estimateStart} to ${review.estimateEnd}\n` : ''}\nTrack Progress:\n${trackLink(review.trackingToken)}\n\nSign in with this email address for your full review history.`);
    await prisma.feedbackReview.update({ where: { id }, data: { [sentField]: new Date() } });
  } catch (error) {
    await prisma.feedbackReview.updateMany({ where: { id, [sentField]: null }, data: { [claimedField]: null } });
    throw error;
  }
}
