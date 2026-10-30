import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { updateProjectStatus } from '@/lib/updateProjectStatus';
import { flushActivityDigest } from '@/lib/activityNotifications';
import { ukToday, isWorkingDay } from '@/lib/feedbackDates';
import { feedbackHolidays } from '@/lib/feedbackHolidays';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const expected = Buffer.from(process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '');
  const supplied = Buffer.from(req.headers.authorization || '');
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'Unauthorized' });
  const job = req.query.job || 'status';
  if (job !== 'status' && job !== 'digest') return res.status(400).json({ error: 'Choose status or digest.' });
  const now = new Date(), day = ukToday(now);
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(now);
  if (hour !== (job === 'status' ? '01' : '09')) return res.json({ skipped: `Outside the ${job === 'status' ? '1 am' : '9 am'} UK delivery window.` });
  try {
    if (!isWorkingDay(day, await feedbackHolidays(day))) return res.json({ skipped: 'Not a working day.' });
    const key = `project-notifications:${job}:${day}`;
    await prisma.scheduledJobRun.upsert({ where: { key }, create: { key }, update: {} });
    const stale = new Date(now.getTime() - 30 * 60 * 1000);
    const claimed = await prisma.scheduledJobRun.updateMany({ where: { key, completedAt: null, OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }] }, data: { claimedAt: now } });
    if (!claimed.count) return res.json({ skipped: 'Already completed or running for this UK date.' });
    try {
      let processed = 0;
      if (job === 'status') {
        const projects = await prisma.project.findMany({ where: { archived: false, isCompleted: false }, select: { id: true }, orderBy: { id: 'asc' } });
        for (const project of projects) { await updateProjectStatus(project.id, now); processed++; }
      } else {
        const delivery = await flushActivityDigest(now);
        if (delivery.failed > 0) throw new Error(`${delivery.failed} notification digests failed; retry required.`);
      }
      await prisma.scheduledJobRun.updateMany({ where: { key, claimedAt: now }, data: { completedAt: new Date() } });
      return res.json({ job, processed });
    } catch (error) {
      // State/outbox updates and delivery claims make partial batches safe to retry.
      await prisma.scheduledJobRun.updateMany({ where: { key, claimedAt: now, completedAt: null }, data: { claimedAt: null } });
      throw error;
    }
  } catch (error) {
    console.error('Project notification job failed:', error);
    return res.status(503).json({ error: 'Unable to complete the scheduled job. Retry shortly.' });
  }
}
