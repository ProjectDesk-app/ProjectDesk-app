import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';
import { updateProjectStatus } from '@/lib/updateProjectStatus';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const userId = Number((session.user as any).id);
  const userRole = (session.user as any).role as string | undefined;

  if (req.method === 'GET') {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    const tasks = await prisma.task.findMany({
      where: { projectId: Number(projectId) },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
    return res.json(tasks);
  }

  if (req.method === 'POST') {
    // Only supervisors can create tasks for now
    if (!requireRole('supervisor', userRole)) return res.status(403).json({ error: 'Forbidden' });
    const { projectId, title, description, dueDate, dependencyTaskId, assignedUserIds, duration } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: 'Missing fields' });

    const task = await prisma.task.create({
      data: {
        projectId: Number(projectId),
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        dependencyTaskId: dependencyTaskId ?? null,
        duration: duration ? Number(duration) : null,
        assignedUsers: Array.isArray(assignedUserIds) && assignedUserIds.length > 0
          ? { connect: assignedUserIds.map((id: number) => ({ id })) }
          : undefined,
      },
    });
    await updateProjectStatus(task.projectId);
    return res.status(201).json(task);
  }

  if (req.method === 'PATCH') {
    const { id, flagged, status, dueDate, dependencyTaskId, assignedUserIds, duration } = req.body;
    if (!id) return res.status(400).json({ error: 'Task id required' });

    const before = await prisma.task.findUnique({ where: { id: Number(id) }, include: { project: true } });
    if (!before) return res.status(404).json({ error: 'Not found' });

    // Normalize status to match Prisma enum
    const normalizedStatus =
      typeof status === 'string'
        ? status.toUpperCase().replace(/\s+/g, '_')
        : undefined;

    const knownStatuses = new Set(
      Object.values(TaskStatus).map(value => value.toString())
    );
    ['REVIEW', 'DEFERRED', 'DONE'].forEach(value => knownStatuses.add(value));

    const statusForUpdate =
      normalizedStatus && knownStatuses.has(normalizedStatus)
        ? (normalizedStatus as TaskStatus)
        : undefined;

    const assignedUsersUpdate =
      Array.isArray(assignedUserIds)
        ? {
            set: [],
            ...(assignedUserIds.length > 0
              ? { connect: assignedUserIds.map((userId: number) => ({ id: userId })) }
              : {}),
          }
        : undefined;

    const updated = await prisma.task.update({
      where: { id: Number(id) },
      data: {
        flagged: typeof flagged === 'boolean' ? flagged : undefined,
        status: statusForUpdate,
        dueDate: typeof dueDate === 'string' ? new Date(dueDate) : undefined,
        dependencyTaskId: dependencyTaskId === undefined ? undefined : dependencyTaskId,
        duration: duration ? Number(duration) : undefined,
        assignedUsers: assignedUsersUpdate,
      },
    });

    // If flagged -> true, notify the supervisor
    if (typeof flagged === 'boolean' && flagged === true) {
      await prisma.notification.create({
        data: {
          projectId: before.projectId,
          taskId: updated.id,
          actorId: userId,
          recipientId: before.project.supervisorId,
          type: 'task_flagged',
          message: `Task "${updated.title}" was flagged for support`,
        },
      });
    }

    return res.json(updated);
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).end('Method Not Allowed');
}
