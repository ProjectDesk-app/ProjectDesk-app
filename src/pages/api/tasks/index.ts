import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';
import { updateProjectStatus } from '@/lib/updateProjectStatus';
import { accessibleTask, accessibleProject, TaskAccessError, taskContext, validateAssignees } from '@/lib/taskAccess';
import { emitTaskChanges } from '@/lib/taskActivity';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any) as any;
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const project = await accessibleProject(req.query.projectId, session.user);
      return res.json(await prisma.task.findMany({ where: { projectId: project.id }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }));
    }
    const body = req.body || {};
    const ids = body.assignedUserIds;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((id: any) => !Number.isSafeInteger(Number(id)) || Number(id) < 1))) throw new TaskAccessError('Invalid assigned users', 400);
    const assignedUsers = ids === undefined ? undefined : { set: Array.from(new Set<number>(ids.map(Number))).map(id => ({ id })) };
    if (req.method === 'POST') {
      const project = await accessibleProject(body.projectId, session.user);
      if (session.user.role !== 'ADMIN' && project.supervisorId !== Number(session.user.id)) throw new TaskAccessError('Forbidden', 403);
      if (ids) validateAssignees(project, ids.map(Number));
      if (!body.title) throw new TaskAccessError('Title required', 400);
      const created = await prisma.task.create({ data: { projectId: project.id, title: body.title, description: body.description, dueDate: body.dueDate ? new Date(body.dueDate) : null, dependencyTaskId: body.dependencyTaskId ?? null, duration: body.duration ? Number(body.duration) : null, assignedUsers: ids?.length ? { connect: ids.map((id: any) => ({ id: Number(id) })) } : undefined }, include: taskContext });
      await emitTaskChanges(null, created, session.user);
      await updateProjectStatus(project.id);
      return res.status(201).json(created);
    }
    if (req.method === 'PATCH') {
      const before = await accessibleTask(body.id, session.user);
      if (ids) validateAssignees(before.project, ids.map(Number));
      const normalizedStatus = typeof body.status === 'string' ? body.status.toUpperCase().replace(/\s+/g, '_') : undefined;
      if (normalizedStatus && !Object.values(TaskStatus).includes(normalizedStatus as TaskStatus)) throw new TaskAccessError('Invalid task status', 400);
      const dueDate = body.dueDate === undefined ? undefined : body.dueDate === null || body.dueDate === '' ? null : new Date(body.dueDate);
      if (dueDate && !Number.isFinite(dueDate.getTime())) throw new TaskAccessError('Invalid due date', 400);
      if (typeof body.flagged === 'boolean' && body.flagged !== before.flagged) {
        const claim = await prisma.task.updateMany({ where: { id: before.id, flagged: before.flagged }, data: { flagged: body.flagged, flaggedAt: body.flagged ? new Date() : null, flaggedByUserId: body.flagged ? Number(session.user.id) : null } });
        if (!claim.count) return res.status(409).json({ error: 'This task changed. Refresh before trying again.' });
      }
      const updated = await prisma.task.update({ where: { id: before.id }, data: { flagged: typeof body.flagged === 'boolean' ? body.flagged : undefined, flaggedAt: typeof body.flagged === 'boolean' ? body.flagged ? before.flaggedAt || new Date() : null : undefined, flaggedByUserId: typeof body.flagged === 'boolean' ? body.flagged ? before.flaggedByUserId || Number(session.user.id) : null : undefined, status: normalizedStatus as TaskStatus, dueDate, dependencyTaskId: body.dependencyTaskId, duration: body.duration === undefined ? undefined : Number(body.duration), ...(assignedUsers ? { assignedUsers } : {}) }, include: taskContext });
      await emitTaskChanges(before, updated, session.user);
      await updateProjectStatus(before.projectId);
      return res.json(updated);
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).end();
  } catch (error) {
    if (error instanceof TaskAccessError) return res.status(error.status).json({ error: error.message });
    console.error('Task operation failed', error);
    return res.status(500).json({ error: 'Unable to process task.' });
  }
}
