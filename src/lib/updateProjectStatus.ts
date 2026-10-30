import { prisma } from '@/lib/prisma';
import { calculateProjectStatus } from '@/lib/projectStatus';
import { enqueueActivity, dispatchActivity } from '@/lib/activityNotifications';
import { Prisma } from '@prisma/client';

/** Recalculate on task changes and in the working-day status job. */
export async function updateProjectStatus(projectId: number, now = new Date()) {
  const update = await prisma.$transaction(async tx => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: { tasks: true, students: { select: { id: true } }, collaborators: { select: { id: true } }, members: { select: { userId: true } } },
    });
    if (!project || project.archived || project.isCompleted) return { result: undefined, deliveryIds: [] as number[] };
    const result = calculateProjectStatus(project, now);
    if (project.status === result.status) return { result, deliveryIds: [] as number[] };
    // Compare the prior version so simultaneous task updates cannot announce the
    // same transition twice. A later scheduled run reconciles concurrent edits.
    const changed = await tx.project.updateMany({
      where: { id: project.id, status: project.status, updatedAt: project.updatedAt, archived: false, isCompleted: false },
      data: { status: result.status },
    });
    if (!changed.count) return { result, deliveryIds: [] as number[] };
    let deliveryIds: number[] = [];
    if (['Behind Schedule', 'At Risk', 'Danger'].includes(result.status)) {
      const origin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
      const taskNames = result.affectedTasks.slice(0, 8).map(task => `• ${task.title || 'Untitled task'}`).join('\n');
      deliveryIds = await enqueueActivity({
        eventKey: `project-status:${project.id}:${project.updatedAt.toISOString()}:${result.status}`,
        category: 'PROJECT_STATUS', actorId: project.supervisorId, suppressActor: false,
        recipientIds: [project.supervisorId, ...project.students.map(user => user.id), ...project.collaborators.map(user => user.id), ...project.members.map(member => member.userId)],
        projectId: project.id,
        subject: `Project ${result.status.toLowerCase()}: ${project.title}`,
        message: `The project "${project.title}" changed from ${project.status} to ${result.status}.\n\n${result.reason}\n\n${taskNames}\n\nView the project tasks:\n${origin}/projects/${project.id}/tasks`,
      }, tx);
    }
    return { result, deliveryIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await dispatchActivity(update.deliveryIds);
  return update.result;
}
