import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { canManageFeedback } from '@/lib/feedback';
import { ukToday, isWorkingDay } from '@/lib/feedbackDates';
import { feedbackHolidays } from '@/lib/feedbackHolidays';
import { sendEmail } from '@/lib/mailer';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '', supplied = req.headers.authorization || '';
  const expectedBuffer = Buffer.from(expected), suppliedBuffer = Buffer.from(supplied);
  if (!expected || expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return res.status(401).json({ error: 'Unauthorized' });
  const now = new Date(), day = ukToday(now), hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(now);
  if (hour !== '09') return res.json({ skipped: 'Outside the 9 am UK delivery window.' });
  try {
    if (!isWorkingDay(day, await feedbackHolidays(day))) return res.json({ skipped: 'Not a working day.' });
    const settings = await prisma.feedbackSettings.findMany({ where: { dailySummaryEnabled: true, OR: [{ lastSummaryDate: null }, { lastSummaryDate: { not: day } }] }, include: { user: true } });
    let sent = 0, failed = 0;
    for (const setting of settings) {
      if (!canManageFeedback(setting.user)) continue;
      const reviews = await prisma.feedbackReview.findMany({ where: { work: { supervisorId: setting.userId }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, include: { work: true }, orderBy: [{ estimateEnd: 'asc' }, { id: 'asc' }] });
      if (!reviews.length) continue;
      const claim = await prisma.feedbackSettings.updateMany({ where: { userId: setting.userId, dailySummaryEnabled: true, OR: [{ lastSummaryDate: null }, { lastSummaryDate: { not: day } }] }, data: { lastSummaryDate: day } });
      if (!claim.count) continue;
      try {
        await sendEmail(setting.user.email, `Feedback Hub: ${reviews.length} outstanding review${reviews.length === 1 ? '' : 's'}`, `Good morning ${setting.user.name || ''},\n\nYour outstanding feedback, earliest due first:\n\n${reviews.map(r => `${r.estimateEnd < day ? 'OVERDUE — ' : ''}${r.work.recipientName}: ${r.work.title} (V${r.version})\n${r.status.replace(/_/g, ' ')} · Estimated return ${r.estimateStart} to ${r.estimateEnd}`).join('\n\n')}\n\nOpen Feedback Hub: ${(process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')}/feedback`);
        sent++;
      } catch { failed++; await prisma.feedbackSettings.updateMany({ where: { userId: setting.userId, lastSummaryDate: day }, data: { lastSummaryDate: setting.lastSummaryDate } }); }
    }
    return res.status(failed ? 502 : 200).json({ sent, failed });
  } catch (error) { console.error('Feedback summary failed:', error); return res.status(503).json({ error: 'Summary delivery unavailable; retry shortly.' }); }
}
