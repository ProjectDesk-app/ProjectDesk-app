import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { updateProjectStatus } from '@/lib/updateProjectStatus';
import { accessibleTask, TaskAccessError, taskContext } from '@/lib/taskAccess';
import { emitTaskChanges } from '@/lib/taskActivity';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).json({ error: 'Method not allowed' }); }
  const session = await getServerSession(req, res, authOptions as any) as any;
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const task = await accessibleTask(req.query.id, session.user);
    const claim = await prisma.task.updateMany({ where: { id: task.id, flagged: task.flagged }, data: { flagged: !task.flagged, flaggedAt: task.flagged ? null : new Date(), flaggedByUserId: task.flagged ? null : Number(session.user.id) } });
    if (!claim.count) return res.status(409).json({ error: 'This task changed. Refresh before trying again.' });
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { ...taskContext, flaggedBy: { select: { id: true, name: true } } } });
    await emitTaskChanges(task, updated, session.user);
    await updateProjectStatus(task.projectId);
    return res.json({ message: task.flagged ? 'Task unflagged' : 'Task flagged and supervisor notified', task: { ...updated, flaggedByName: updated.flaggedBy?.name || null } });
  } catch (error) {
    if (error instanceof TaskAccessError) return res.status(error.status).json({ error: error.message });
    console.error('Flag update failed', error);
    return res.status(500).json({ error: 'Unable to update flag.' });
  }
}
