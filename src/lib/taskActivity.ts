import { emitActivity } from '@/lib/activityNotifications';
import { assignedIds } from './taskAccess';

function dateValue(value: any) { return value ? new Date(value).getTime() : null; }
function dateLabel(value: any) {
  return value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value)) : 'No deadline';
}
/** All task edit endpoints share recipients, transition checks, and event keys. */
export async function emitTaskChanges(before: any | null, after: any, actor: any) {
  const common = { actorId: Number(actor.id), projectId: after.projectId, taskId: after.id };
  const stamp = new Date(after.updatedAt || after.createdAt || new Date()).toISOString();
  const prefix = `task:${after.id}:${stamp}`;
  const oldAssigned = new Set(before ? assignedIds(before) : []);
  const newlyAssigned = assignedIds(after).filter(id => !oldAssigned.has(id));
  if (newlyAssigned.length) await emitActivity({
    ...common, eventKey: `${prefix}:assigned`, category: 'TASK_ASSIGNED', recipientIds: newlyAssigned,
    subject: `Task assigned: ${after.title}`,
    message: `${actor.name || 'Someone'} assigned you to "${after.title}".`,
  });
  if (before && dateValue(before.dueDate) !== dateValue(after.dueDate)) await emitActivity({
    ...common, eventKey: `${prefix}:deadline`, category: 'TASK_DEADLINE', recipientIds: assignedIds(after),
    subject: `Task deadline changed: ${after.title}`,
    message: `The deadline for "${after.title}" changed from ${dateLabel(before.dueDate)} to ${dateLabel(after.dueDate)}.`,
  });
  if (after.flagged && !before?.flagged) await emitActivity({
    ...common, eventKey: `${prefix}:flag`, category: 'TASK_FLAG', recipientIds: [after.project.supervisorId],
    subject: `Assistance requested: ${after.title}`,
    message: `${actor.name || 'A project participant'} flagged "${after.title}" in "${after.project.title}" for assistance.`,
  });
}
