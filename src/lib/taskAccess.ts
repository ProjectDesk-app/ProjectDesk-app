import { prisma } from '@/lib/prisma';

export class TaskAccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const userSummary = { select: { id: true, name: true, email: true } };
const projectPeople = { supervisor: userSummary, students: userSummary, collaborators: userSummary, members: true };
export const taskContext = {
  project: { include: projectPeople },
  assignedUsers: userSummary,
  assignee: userSummary,
};
export function projectAccess(project: any, user: any) {
  const id = Number(user?.id);
  return Boolean(id && (user.role === 'ADMIN' || project.supervisorId === id ||
    project.students?.some((member: any) => member.id === id) ||
    project.collaborators?.some((member: any) => member.id === id) ||
    project.members?.some((member: any) => member.userId === id)));
}
export async function accessibleTask(id: unknown, user: any) {
  const taskId = Number(id);
  if (!Number.isSafeInteger(taskId) || taskId < 1) throw new TaskAccessError('Invalid task ID', 400);
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskContext });
  if (!task) throw new TaskAccessError('Task not found', 404);
  if (!projectAccess(task.project, user) && task.assigneeId !== Number(user?.id) && !task.assignedUsers?.some((assigned: any) => assigned.id === Number(user?.id))) throw new TaskAccessError('Access denied', 403);
  return task;
}
export async function accessibleProject(id: unknown, user: any) {
  const projectId = Number(id);
  if (!Number.isSafeInteger(projectId) || projectId < 1) throw new TaskAccessError('Invalid project ID', 400);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectPeople });
  if (!project) throw new TaskAccessError('Project not found', 404);
  if (!projectAccess(project, user)) throw new TaskAccessError('Access denied', 403);
  return project;
}
export function assignedIds(task: any): number[] {
  return Array.from(new Set([task.assigneeId, ...(task.assignedUsers || []).map((user: any) => user.id)].filter((id): id is number => Number.isSafeInteger(id) && id > 0)));
}

export function validateAssignees(project: any, ids: number[]) {
  const allowed = new Set([project.supervisorId, ...(project.students || []).map((user: any) => user.id), ...(project.collaborators || []).map((user: any) => user.id), ...(project.members || []).map((member: any) => member.userId)]);
  if (ids.some(id => !allowed.has(id))) throw new TaskAccessError('Assigned users must belong to this project', 400);
}
