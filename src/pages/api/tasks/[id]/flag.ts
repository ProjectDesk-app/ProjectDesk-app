import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProjectStatus } from "@/lib/updateProjectStatus";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id } = req.query;
    const taskId = Number(id);
    const userEmail = session.user?.email;

    const user = await prisma.user.findUnique({ where: { email: userEmail! } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // ✅ Fetch task before using it
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { supervisor: true } } },
    });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const wasFlagged = task.flagged;

    // ✅ Toggle flag and record who flagged
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        flagged: !wasFlagged,
        flaggedBy: {
    connect: { id: session.user.id },
        },
      },
      include: { flaggedBy: true },
    });

    await updateProjectStatus(updatedTask.projectId);

    // ✅ Only create a notification when newly flagged
    if (!wasFlagged) {
      await prisma.notification.create({
        data: {
          message: `${user.name || "A student"} flagged task "${task.title}" for assistance.`,
          type: "task_flagged",
          projectId: task.projectId,
          taskId: task.id,
          actorId: user.id,
          recipientId: task.project.supervisor.id,
        },
      });
    }

    res.status(200).json({
      message: wasFlagged ? "Task unflagged" : "Task flagged and supervisor notified",
      task: {
        ...updatedTask,
        flaggedByName: updatedTask.flaggedBy?.name || null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}