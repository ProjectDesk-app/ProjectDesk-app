import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { defaultNotificationPreferences } from '@/lib/activityNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'PUT'].includes(req.method || '')) { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'Method not allowed' }); }
  const session = await getServerSession(req, res, authOptions as any) as any;
  const userId = Number(session?.user?.id);
  if (!userId) return res.status(401).json({ error: 'Sign in to manage notification preferences.' });
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
    if (!user?.emailVerified) return res.status(401).json({ error: 'Verify your email before changing preferences.' });
    if (req.method === 'PUT') {
      const input = req.body;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return res.status(400).json({ error: 'Invalid preferences.' });
      const data: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (!Object.hasOwn(defaultNotificationPreferences, key)) return res.status(400).json({ error: 'Unknown notification preference.' });
        const isMode = ['taskComments', 'taskFlags', 'projectStatus'].includes(key);
        if (isMode ? !['IMMEDIATE', 'DAILY', 'IN_APP'].includes(value as string) : typeof value !== 'boolean') return res.status(400).json({ error: 'Choose a valid notification preference.' });
        data[key] = value;
      }
      await prisma.notificationPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    }
    const prefs = await prisma.notificationPreferences.findUnique({ where: { userId } });
    const result: any = {};
    for (const key of Object.keys(defaultNotificationPreferences)) result[key] = prefs?.[key] ?? defaultNotificationPreferences[key];
    return res.json(result);
  } catch (error) { console.error('Notification preferences failed:', error); return res.status(500).json({ error: 'Unable to save notification preferences. Please try again.' }); }
}
