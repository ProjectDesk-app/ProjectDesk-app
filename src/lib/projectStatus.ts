/** One completion definition for status calculations, reminders and task updates. */
export function isCompletedTask(status: unknown): boolean {
  return ['done', 'complete', 'completed'].includes(String(status ?? '').trim().toLowerCase());
}

type StatusTask = { id?: number; title?: string; status: unknown; dueDate?: Date | string | null; startDate?: Date | string | null; duration?: number | null };
type StatusProject = { tasks: StatusTask[]; endDate?: Date | string | null };

export function calculateProjectStatus(project: StatusProject, now = new Date()) {
  const active = project.tasks.filter(task => !isCompletedTask(task.status));
  const dayMs = 86_400_000;
  const overdue = active.filter(task => task.dueDate && new Date(task.dueDate).getTime() < now.getTime() - dayMs);
  const behind = active.filter(task => task.dueDate && new Date(task.dueDate).getTime() < now.getTime());
  const beyondEnd = active.filter(task => task.dueDate && project.endDate && new Date(task.dueDate).getTime() > new Date(project.endDate).getTime());
  const durationOverflow = active.filter(task => task.startDate && !task.dueDate && task.duration && project.endDate && new Date(task.startDate).getTime() + task.duration * dayMs > new Date(project.endDate).getTime());
  let status = 'On Track';
  let reason = '';
  let affectedTasks: StatusTask[] = [];
  if (!project.tasks.length) status = 'Not Started';
  else if (!active.length) status = 'Completed';
  else if (beyondEnd.length || durationOverflow.length) {
    status = 'Danger'; affectedTasks = [...beyondEnd, ...durationOverflow];
    reason = `${affectedTasks.length} unfinished task${affectedTasks.length === 1 ? ' is' : 's are'} scheduled beyond the project end date.`;
  } else if (behind.length >= 2) {
    status = 'At Risk'; affectedTasks = behind;
    reason = `${behind.length} unfinished tasks have passed their deadlines.`;
  } else if (overdue.length) {
    status = 'Behind Schedule'; affectedTasks = overdue;
    reason = `${overdue.length} unfinished task${overdue.length === 1 ? ' is' : 's are'} more than 24 hours overdue.`;
  }
  return { status, reason, affectedTasks, overdueTasks: overdue.length, beyondEnd: beyondEnd.length };
}
