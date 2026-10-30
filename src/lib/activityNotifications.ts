import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { isEmailBlocked } from '@/lib/blockedEmails';
import { ukToday, shiftDay } from '@/lib/feedbackDates';
import { deadlineInstant } from '@/lib/taskSetSchedule';

export const defaultNotificationPreferences = {
  taskComments: 'IMMEDIATE', taskFlags: 'IMMEDIATE', projectStatus: 'IMMEDIATE',
  deadlineSummary: true, taskAssignments: true, taskDeadlineChanges: true,
};
export type ActivityInput = {
  eventKey: string; category: 'TASK_COMMENT' | 'TASK_FLAG' | 'PROJECT_STATUS' | 'TASK_ASSIGNED' | 'TASK_DEADLINE';
  actorId: number; recipientIds: number[]; projectId: number; taskId?: number;
  subject: string; message: string; suppressActor?: boolean;
};
export function activityDeliveryMode(category: ActivityInput['category'], preferences: any) {
  const prefs = { ...defaultNotificationPreferences, ...preferences };
  if (category === 'TASK_ASSIGNED') return prefs.taskAssignments ? 'IN_APP' : 'DISABLED';
  if (category === 'TASK_DEADLINE') return prefs.taskDeadlineChanges ? 'IN_APP' : 'DISABLED';
  const key = { TASK_COMMENT: 'taskComments', TASK_FLAG: 'taskFlags', PROJECT_STATUS: 'projectStatus' }[category];
  return prefs[key] || 'IMMEDIATE';
}
const baseUrl = () => (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
function activityLink(input: {projectId: number;taskId?: number | null}) { return `${baseUrl()}${input.taskId ? `/tasks/${input.taskId}` : `/projects/${input.projectId}`}`; }

/** Call within the source mutation transaction to persist the alert and its delivery together. */
export async function enqueueActivity(input: ActivityInput, client: any = prisma): Promise<number[]> {
  const recipients = Array.from(new Set(input.recipientIds)).filter(id => Number.isSafeInteger(id) && id > 0 && (input.suppressActor === false || id !== input.actorId));
  const ids: number[] = [];
  for (const userId of recipients) {
    if (await client.activityEmail.findUnique({ where: { userId_eventKey: { userId, eventKey: input.eventKey } } })) continue;
    const prefs = await client.notificationPreferences.findUnique({ where: { userId } });
    const mode = activityDeliveryMode(input.category, prefs);
    const delivery = await client.activityEmail.create({ data: {
      userId, eventKey: input.eventKey, category: input.category, subject: input.subject,
      message: input.message, projectId: input.projectId, taskId: input.taskId,
      deliveryMode: mode, status: ['IN_APP', 'DISABLED'].includes(mode) ? 'SKIPPED' : 'PENDING',
    } });
    if (mode !== 'DISABLED') await client.notification.create({ data: {
      actorId: input.actorId, recipientId: userId, projectId: input.projectId, taskId: input.taskId,
      type: ({ TASK_COMMENT: 'new_comment', TASK_FLAG: 'task_flagged', PROJECT_STATUS: 'project_status', TASK_ASSIGNED: 'task_assigned', TASK_DEADLINE: 'task_deadline_changed' })[input.category], message: input.message,
    } });
    if (mode === 'IMMEDIATE') ids.push(delivery.id);
  }
  return ids;
}
async function recipientCanRead(user: any, project: any, task?: any) {
  if (user.feedbackOnly || !project || project.archived || project.isCompleted) return false;
  if (project.supervisorId === user.id || project.students.some((u: any) => u.id === user.id) || project.collaborators.some((u: any) => u.id === user.id) || project.members.some((m: any) => m.userId === user.id)) return true;
  if (task && typeof task === 'object') return task.assigneeId === user.id || task.assignedUsers.some((u: any) => u.id === user.id);
  if (!task) return false;
  return Boolean(await prisma.task.findFirst({ where: { id: task, projectId: project.id, OR: [{ assigneeId: user.id }, { assignedUsers: { some: { id: user.id } } }] }, select: { id: true } }));
}
const projectAccess = { students: { select: { id: true } }, collaborators: { select: { id: true } }, members: { select: { userId: true } } };

/** A delivery failure must never turn a successfully saved comment into a failed request. */
export async function dispatchActivity(ids: number[]) {
  for (const id of ids) {
    const claimed = await prisma.activityEmail.updateMany({ where: { id, status: 'PENDING', claimedAt: null }, data: { claimedAt: new Date() } });
    if (!claimed.count) continue;
    try {
      const entry = await prisma.activityEmail.findUniqueOrThrow({ where: { id }, include: { user: { include: { notificationPreferences: true } } } });
      const project = await prisma.project.findUnique({ where: { id: entry.projectId }, include: projectAccess });
      const mode = activityDeliveryMode(entry.category as ActivityInput['category'], entry.user.notificationPreferences);
      if (mode === 'DAILY') { await prisma.activityEmail.update({ where: { id }, data: { claimedAt: null, deliveryMode: 'DAILY' } }); continue; }
      if (mode !== 'IMMEDIATE' || !entry.user.emailVerified || !(await recipientCanRead(entry.user, project, entry.taskId)) || await isEmailBlocked(entry.user.email)) {
        await prisma.activityEmail.update({ where: { id }, data: { status: 'SKIPPED', claimedAt: null } }); continue;
      }
      await sendEmail(entry.user.email, entry.subject, `${entry.message}\n\nOpen in Project Desk:\n${activityLink(entry)}\n\nManage these emails under My Account → Notification preferences.`);
      await prisma.activityEmail.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (error) {
      console.error('Activity email delivery failed:', error);
      await prisma.activityEmail.updateMany({ where: { id, status: 'PENDING' }, data: { claimedAt: null } });
    }
  }
}
export async function emitActivity(input: ActivityInput) {
  try {
    const ids = await prisma.$transaction(tx => enqueueActivity(input, tx));
    await dispatchActivity(ids);
  } catch (error: any) {
    if (error?.code !== 'P2002') console.error('Unable to record task notification:', error);
  }
}

/** One combined morning email per recipient, with pending events and relevant deadlines. */
export async function flushActivityDigest(now = new Date()) {
  const day = ukToday(now);
  const cutoff = deadlineInstant(shiftDay(day, 3), '23:59');
  const dueTasks = await prisma.task.findMany({ where: {
    dueDate: { lte: cutoff }, status: { notIn: ['COMPLETE', 'DONE'] },
    project: { archived: false, isCompleted: false },
  }, include: { assignedUsers: { select: { id: true } }, project: { include: projectAccess } }, orderBy: { dueDate: 'asc' } });
  const pending = await prisma.activityEmail.findMany({ where: { status: 'PENDING', claimedAt: null }, orderBy: { id: 'asc' } });
  const recipientIds = new Set(pending.map(entry => entry.userId));
  for (const task of dueTasks) {
    recipientIds.add(task.project.supervisorId);
    if (task.assigneeId) recipientIds.add(task.assigneeId);
    task.assignedUsers.forEach(u => recipientIds.add(u.id));
  }
  let sent = 0, failed = 0;
  for (const userId of Array.from(recipientIds)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { notificationPreferences: true } });
    if (!user || !user.emailVerified || user.feedbackOnly || await isEmailBlocked(user.email)) continue;
    const prefs = { ...defaultNotificationPreferences, ...user.notificationPreferences };
    const tasks = prefs.deadlineSummary ? dueTasks.filter(t => t.project.supervisorId === userId || t.assigneeId === userId || t.assignedUsers.some(u => u.id === userId)) : [];
    const accessibleTasks = [];
    for (const task of tasks) if (await recipientCanRead(user, task.project, task)) accessibleTasks.push(task);
    const events = [];
    for (const event of pending.filter(e => e.userId === userId)) {
      const mode = activityDeliveryMode(event.category as ActivityInput['category'], prefs);
      const project = await prisma.project.findUnique({ where: { id: event.projectId }, include: projectAccess });
      if (!['IMMEDIATE', 'DAILY'].includes(mode) || !(await recipientCanRead(user, project, event.taskId))) {
        await prisma.activityEmail.updateMany({ where: { id: event.id, claimedAt: null, status: 'PENDING' }, data: { status: 'SKIPPED' } });
      } else events.push(event);
    }
    if (!accessibleTasks.length && !events.length) continue;
    const key = `activity-digest:${day}:${userId}`;
    await prisma.scheduledJobRun.upsert({ where: { key }, create: { key }, update: {} });
    const claim = await prisma.scheduledJobRun.updateMany({ where: { key, completedAt: null, claimedAt: null }, data: { claimedAt: now } });
    if (!claim.count) continue;
    const claimedEvents = [];
    try {
      for (const event of events) {
        const result = await prisma.activityEmail.updateMany({ where: { id: event.id, claimedAt: null, status: 'PENDING' }, data: { claimedAt: now } });
        if (result.count) claimedEvents.push(event);
      }
      if (!accessibleTasks.length && !claimedEvents.length) { await prisma.scheduledJobRun.update({ where: { key }, data: { completedAt: new Date() } }); continue; }
      const sections: string[] = [];
      if (claimedEvents.length) sections.push(`Project activity\n\n${claimedEvents.map(e => `${e.subject}\n${e.message}\n${activityLink(e)}`).join('\n\n')}`);
      if (accessibleTasks.length) sections.push(`Upcoming and overdue tasks\n\n${accessibleTasks.map(t => {
        const due = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }).format(t.dueDate!);
        return `${new Date(t.dueDate!).getTime() < now.getTime() ? 'OVERDUE — ' : ''}${t.title}\nProject: ${t.project.title}\nDue: ${due}\n${activityLink({ projectId: t.projectId, taskId: t.id })}`;
      }).join('\n\n')}`);
      await sendEmail(user.email, 'Your Project Desk daily summary', `Good morning ${user.name || ''},\n\n${sections.join('\n\n')}\n\nManage these emails under My Account → Notification preferences.`);
      await prisma.$transaction(async tx => {
        await tx.activityEmail.updateMany({ where: { id: { in: claimedEvents.map(e => e.id) }, status: 'PENDING', claimedAt: now }, data: { status: 'SENT', sentAt: new Date() } });
        await tx.scheduledJobRun.update({ where: { key }, data: { completedAt: new Date() } });
      });
      sent++;
    } catch (error) {
      failed++; console.error('Daily activity summary failed:', error);
      await prisma.activityEmail.updateMany({ where: { id: { in: claimedEvents.map(e => e.id) }, status: 'PENDING', claimedAt: now }, data: { claimedAt: null } });
      await prisma.scheduledJobRun.updateMany({ where: { key, completedAt: null }, data: { claimedAt: null } });
    }
  }
  return { sent, failed };
}
