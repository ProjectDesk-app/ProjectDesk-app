import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const userId = Number((session.user as any).id);

  if (req.method === 'GET') {
    const items = await prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { task: true, project: true, actor: true },
    });
    return res.json(items);
  }

  if (req.method === 'PATCH') {
    const { ids, read } = req.body as { ids: number[]; read: boolean };
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });
    await prisma.notification.updateMany({
      where: { id: { in: ids }, recipientId: userId },
      data: { read },
    });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).end('Method Not Allowed');
}