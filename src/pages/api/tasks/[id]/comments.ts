import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { emitActivity } from '@/lib/activityNotifications';
import { accessibleTask, TaskAccessError, assignedIds } from '@/lib/taskAccess';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method || '')) {
    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end();
  }
  const session = await getServerSession(req, res, authOptions as any) as any;
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const task = await accessibleTask(req.query.id, session.user);
    if (req.method === 'GET') {
      const comments = await prisma.comment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' }, include: { User: { select: { id: true, name: true, email: true } } } });
      return res.json(comments.map(({ User, ...rest }) => ({ ...rest, user: User })));
    }
    const content = req.body?.content;
    if (req.method !== 'DELETE' && (typeof content !== 'string' || !content.trim() || content.length > 10000)) return res.status(400).json({ error: 'Enter a comment of up to 10,000 characters.' });
    if (req.method === 'POST') {
      const comment = await prisma.comment.create({ data: { content: content.trim(), userId: Number(session.user.id), taskId: task.id }, include: { User: { select: { id: true, name: true, email: true } } } });
      const project = task.project;
      await emitActivity({ eventKey: `comment:${comment.id}`, category: 'TASK_COMMENT', actorId: Number(session.user.id), projectId: project.id, taskId: task.id,
        recipientIds: Array.from(new Set([project.supervisorId, ...project.students.map(u => u.id), ...project.collaborators.map(u => u.id), ...project.members.map(u => u.userId), ...assignedIds(task)])),
        subject: `New comment: ${task.title}`,
        message: `${session.user.name || 'Someone'} commented on "${task.title}" in "${project.title}":\n\n${comment.content.slice(0, 1000)}` });
      const { User, ...rest } = comment;
      return res.status(201).json({ ...rest, user: User });
    }
    const commentId = Number(req.body?.id);
    if (!Number.isSafeInteger(commentId) || commentId < 1) return res.status(400).json({ error: 'Invalid comment ID' });
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { userId: true, taskId: true } });
    if (!comment || comment.taskId !== task.id) return res.status(404).json({ error: 'Comment not found' });
    if (comment.userId !== Number(session.user.id)) return res.status(403).json({ error: 'Forbidden' });
    if (req.method === 'PATCH') return res.json(await prisma.comment.update({ where: { id: commentId }, data: { content: content.trim() } }));
    await prisma.comment.delete({ where: { id: commentId } });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof TaskAccessError) return res.status(error.status).json({ error: error.message });
    console.error('Task comment failed', error);
    return res.status(500).json({ error: 'Unable to process this comment.' });
  }
}
