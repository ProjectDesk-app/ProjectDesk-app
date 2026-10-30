import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { calendarDuration } from '@/lib/taskSetSchedule';
import { updateProjectStatus } from '@/lib/updateProjectStatus';
import { accessibleTask, TaskAccessError, taskContext, validateAssignees } from '@/lib/taskAccess';
import { emitTaskChanges } from '@/lib/taskActivity';
import { TaskStatus } from '@prisma/client';

function optionalDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new TaskAccessError('Invalid date value', 400);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TaskAccessError('Invalid date value', 400);
  return date;
}
function assignedUsers(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(id => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) throw new TaskAccessError('Invalid assigned users', 400);
  return { set: Array.from(new Set(value.map(Number))).map(id => ({ id })) };
}
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PATCH', 'PUT', 'POST', 'DELETE'].includes(req.method || '')) { res.setHeader('Allow', ['GET', 'PATCH', 'PUT', 'POST', 'DELETE']); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions as any) as any;
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.body?.id !== undefined && Number(req.body.id) !== Number(req.query.id)) throw new TaskAccessError('Task ID does not match this URL', 400);
    const before = await accessibleTask(req.query.id, session.user);
    if (req.method === 'GET') return res.json({ task: before });
    if (req.method === 'DELETE') {
      if (session.user.role !== 'ADMIN' && before.project.supervisorId !== Number(session.user.id)) throw new TaskAccessError('Forbidden', 403);
      await prisma.task.delete({ where: { id: before.id } });
      await updateProjectStatus(before.projectId);
      return res.json({ message: 'Task deleted successfully' });
    }
    const body = req.body || {};
    if (req.method === 'POST') {
      const users = assignedUsers(body.assignedUserIds);
      if (users) validateAssignees(before.project, users.set.map(user => user.id));
      if (!body.unflag && !users && !before.flagged) {
        const claim = await prisma.task.updateMany({ where: { id: before.id, flagged: false }, data: { flagged: true, flaggedAt: new Date(), flaggedByUserId: Number(session.user.id) } });
        if (!claim.count) return res.status(409).json({ error: 'This task changed. Refresh before trying again.' });
        const updated = await prisma.task.findUniqueOrThrow({ where: { id: before.id }, include: taskContext });
        await emitTaskChanges(before, updated, session.user);
        await updateProjectStatus(before.projectId);
        return res.json({ task: updated, message: 'Task flagged' });
      }
      const flagData = body.unflag ? { flagged: false, flaggedAt: null, flaggedByUserId: null } : users ? {} : { flagged: true, flaggedAt: before.flaggedAt || new Date(), flaggedByUserId: before.flaggedByUserId || Number(session.user.id) };
      const updated = await prisma.task.update({ where: { id: before.id }, data: { ...flagData, ...(users ? { assignedUsers: users } : {}) }, include: taskContext });
      await emitTaskChanges(before, updated, session.user);
      await updateProjectStatus(before.projectId);
      return res.json({ task: updated, message: body.unflag ? 'Task unflagged' : users ? 'Assigned users updated' : 'Task flagged' });
    }
    const parsedStart = optionalDate(body.startDate), parsedDue = optionalDate(body.dueDate);
    const normalizedStatus = typeof body.status === 'string' ? body.status.toUpperCase().replace(/\s+/g, '_') : undefined;
    if (normalizedStatus && !Object.values(TaskStatus).includes(normalizedStatus as TaskStatus)) throw new TaskAccessError('Invalid task status', 400);
    let duration = body.duration !== undefined ? Number(body.duration) : undefined;
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 0)) throw new TaskAccessError('Invalid duration', 400);
    if (parsedStart instanceof Date && parsedDue instanceof Date) duration = before.kind === 'MILESTONE' ? 0 : Math.max(0, calendarDuration(parsedStart, parsedDue));
    const users = assignedUsers(body.assignedUserIds);
    if (users) validateAssignees(before.project, users.set.map(user => user.id));
    const updated = await prisma.task.update({ where: { id: before.id }, data: { title: body.title, description: body.description, dueDate: parsedDue, startDate: parsedStart, duration, status: normalizedStatus as TaskStatus, ...(users ? { assignedUsers: users } : {}) }, include: taskContext });
    await emitTaskChanges(before, updated, session.user);
    await updateProjectStatus(before.projectId);
    return res.json(updated);
  } catch (error) {
    if (error instanceof TaskAccessError) return res.status(error.status).json({ error: error.message });
    console.error('Task operation failed', error);
    return res.status(500).json({ error: 'Unable to update task.' });
  }
}
