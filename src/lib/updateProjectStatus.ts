import { prisma } from "@/lib/prisma";

const normalizeStatus = (status: unknown) =>
  typeof status === "string" ? status.toLowerCase() : String(status ?? "").toLowerCase();

export async function updateProjectStatus(projectId: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: true },
  });

  if (!project) return;

  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Grace period for overdue tasks
  const overdueTasks = project.tasks.filter(
    t =>
      t.dueDate &&
      new Date(t.dueDate).getTime() < now.getTime() - oneDayMs &&
      normalizeStatus(t.status) !== "done" &&
      normalizeStatus(t.status) !== "completed"
  );

  // Tasks exceeding project end date
  const tasksBeyondProject = project.tasks.filter(
    t =>
      t.dueDate &&
      project.endDate &&
      new Date(t.dueDate).getTime() > new Date(project.endDate).getTime()
  );

  // Tasks where duration extends past project end
  const durationOverflow = project.tasks.filter(
    t =>
      t.startDate &&
      t.duration &&
      project.endDate &&
      new Date(t.startDate).getTime() + t.duration * oneDayMs >
        new Date(project.endDate).getTime()
  );

  // Identify tasks behind schedule (based on status and due date)
  const activeStatuses = new Set([
    "todo",
    "to_do",
    "in_progress",
    "behind_schedule",
    "at_risk",
    "blocked",
    "review",
    "deferred",
  ]);

  const behindScheduleTasks = project.tasks.filter(t => {
    if (!t.dueDate) return false;
    const status = normalizeStatus(t.status);
    return new Date(t.dueDate).getTime() < now.getTime() && activeStatuses.has(status);
  });

  let newStatus = "On Track";

  if (project.tasks.length === 0) {
    newStatus = "Not Started";
  } else if (project.tasks.every(t => {
      const status = normalizeStatus(t.status);
      return status === "done" || status === "completed" || status === "complete";
    })) {
    newStatus = "Completed";
  } else if (durationOverflow.length > 0 || tasksBeyondProject.length > 0) {
    newStatus = "Danger";
  } else if (behindScheduleTasks.length >= 2) {
    newStatus = "At Risk";
  } else if (overdueTasks.length > 0) {
    newStatus = "Behind Schedule";
  } else {
    newStatus = "On Track";
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: newStatus },
  });

  return {
    status: newStatus,
    overdueTasks: overdueTasks.length,
    beyondEnd: tasksBeyondProject.length,
  };
}
