import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

// Helper to get task by ID
async function getTaskById(taskId: string) {
  return prisma.task.findUnique({
    where: { id: Number(taskId) },
    include: {
      project: {
        include: {
          students: true,
          collaborators: true,
          supervisor: true,
        },
      },
      assignee: true,
      assignedUsers: true,
      connectedFiles: {
        include: {
          addedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const {
    query: { id },
    method,
    body,
  } = req;

  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid task ID" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (method === "GET") {
    // Fetch a task by ID
    const task = await getTaskById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    return res.status(200).json({ task });
  }

  if (req.method === "PATCH" || req.method === "PUT") {
    const {
      id: bodyId,
      title,
      description,
      status,
      dueDate,
      startDate,
      duration,
      assignedUserIds,
    } = req.body;

    const taskIdToUse = bodyId || id;

    if (!taskIdToUse) {
      return res.status(400).json({ error: "Task ID is required for update." });
    }

    // Normalize status to match Prisma enum
    const normalizedStatus = status
      ? status.toUpperCase().replace(/\s+/g, "_")
      : undefined;

    try {
      const parsedStart = startDate ? new Date(startDate) : undefined;
      const parsedDue = dueDate ? new Date(dueDate) : undefined;

      let autoDuration: number | undefined = duration ? Number(duration) : undefined;
      if (parsedStart && parsedDue) {
        const diff = Math.ceil((parsedDue.getTime() - parsedStart.getTime()) / (1000 * 60 * 60 * 24));
        autoDuration = diff >= 0 ? diff : 0;
      }

      const assignedUsersUpdate = Array.isArray(assignedUserIds)
        ? {
            set: [],
            ...(assignedUserIds.length > 0
              ? {
                  connect: assignedUserIds
                    .map((userId: any) => Number(userId))
                    .filter((value) => !Number.isNaN(value))
                    .map((userId) => ({ id: userId })),
                }
              : {}),
          }
        : undefined;

      const updated = await prisma.task.update({
        where: { id: Number(taskIdToUse) },
        data: {
          title,
          description,
          dueDate: parsedDue,
          startDate: parsedStart,
          duration: autoDuration,
          status: normalizedStatus,
          ...(assignedUsersUpdate ? { assignedUsers: assignedUsersUpdate } : {}),
        },
        include: { assignedUsers: true },
      });

      return res.status(200).json(updated);
    } catch (error: any) {
      console.error("Task update error:", error.message || error);
      return res.status(500).json({ error: "Failed to update task" });
    }
  }

  if (method === "POST") {
    // Toggle flag/unflag or update assigned users
    const { unflag, assignedUserIds } = body;
    const task = await prisma.task.findUnique({ where: { id: Number(id) } });
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    if (unflag) {
      // Unflag: set flagged=false, delete notification
      const updated = await prisma.task.update({
        where: { id: Number(id) },
        data: { flagged: false, flaggedAt: null },
        include: { assignedUsers: true },
      });
      await prisma.notification.deleteMany({
        where: {
          taskId: Number(id),
          type: "flag",
        },
      });
      return res.status(200).json({ task: updated, message: "Task unflagged" });
    } else if (assignedUserIds) {
      // Update assigned users
      const updated = await prisma.task.update({
        where: { id: Number(id) },
        data: {
          assignedUsers: {
            set: [],
            connect: assignedUserIds.map((userId: string) => ({ id: userId })),
          },
        },
        include: { assignedUsers: true },
      });
      return res.status(200).json({ task: updated, message: "Assigned users updated" });
    } else {
      // Flag: set flagged=true, create notification
      const updated = await prisma.task.update({
        where: { id: Number(id) },
        data: { flagged: true, flaggedAt: new Date() },
        include: { assignedUsers: true },
      });
      // Actor's name
      const actorName = session.user?.name || session.user?.email || "Someone";
      const actorId = Number(session.user?.id) || undefined;
      // Find assigned user to notify
      const assigneeId = task.assigneeId;
      if (assigneeId) {
        await prisma.notification.create({
          data: {
            type: "task_flagged",
            message: `Task "${task.title}" was flagged by ${actorName}`,
            taskId: Number(id),
            projectId: task.projectId,
            recipientId: assigneeId,
            actorId: actorId ?? assigneeId,
          },
        });
      }
      return res.status(200).json({ task: updated, message: "Task flagged" });
    }
  }

  if (method === "DELETE") {
    const taskId = Number(id);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    if (session.user.role !== "SUPERVISOR") {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      await prisma.task.delete({
        where: { id: taskId },
      });
      return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      return res.status(500).json({ error: "Failed to delete task" });
    }
  }

  return res.setHeader("Allow", ["GET", "PUT", "POST", "DELETE"]).status(405).end(`Method ${method} Not Allowed`);
}
