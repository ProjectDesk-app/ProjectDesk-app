import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { updateProjectStatus } from "@/lib/updateProjectStatus";
import { findManagedTaskSet, positiveId } from "@/lib/taskSetAccess";
import { dateOnly, parseCalendarDate, resolveTemplate } from "@/lib/taskSetSchedule";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role)) return res.status(403).json({ error: "Access denied" });
  const id = positiveId(req.query.id), projectId = positiveId(req.body.projectId);
  if (!id || !projectId) return res.status(400).json({ error: "Provide valid task set and project IDs." });
  try {
    const taskSet = await findManagedTaskSet(id, session.user);
    if (!taskSet) return res.status(404).json({ error: "Task set not found" });
    const templates = taskSet.templates.filter(t => t.kind !== "BREAK");
    if (!templates.length) return res.status(400).json({ error: "This set has no tasks to apply." });
    const project = await prisma.project.findFirst({ where: {
      id: projectId, ...(session.user.role === "ADMIN" ? {} : { supervisorId: Number(session.user.id) }),
    }, select: { startDate: true, isCompleted: true } });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.isCompleted) return res.status(400).json({ error: "Choose an active project." });
    const mode = req.body.dateMode ?? (taskSet.scheduleStartDate ? "timetable" : "project");
    let base: string;
    try {
      if (mode === "timetable" && taskSet.scheduleStartDate) base = dateOnly(taskSet.scheduleStartDate);
      else if (mode === "project" && project.startDate) base = dateOnly(project.startDate);
      else if (mode === "custom") base = dateOnly(parseCalendarDate(req.body.scheduleStartDate));
      else throw new Error("Choose a schedule start date; this project or timetable has no start date.");
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    let tasks;
    try {
      tasks = templates.map(t => {
        const { startDate, dueDate, duration } = resolveTemplate(t, base);
        return { title: t.title, description: t.description, startDate, dueDate, duration, projectId,
          kind: t.kind === "MILESTONE" ? "MILESTONE" : "TASK" };
      });
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    const existing = await prisma.task.findMany({ where: { projectId, title: { in: tasks.map(t => t.title) } }, select: { title: true } });
    if (existing.length) return res.status(409).json({ error: `No tasks added. This project already contains: ${existing.map(t => t.title).join(", ")}.` });
    // createMany is atomic, preventing partial schedules during duplicate applications.
    const result = await prisma.task.createMany({ data: tasks });
    await updateProjectStatus(projectId);
    return res.status(201).json({ tasksCreated: result.count, message: `“${taskSet.name}” applied successfully.` });
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(409).json({ error: "No tasks added. Some tasks already exist in this project." });
    console.error("Task set application error:", error);
    return res.status(500).json({ error: "Unable to apply this task set. No tasks were added." });
  }
}
