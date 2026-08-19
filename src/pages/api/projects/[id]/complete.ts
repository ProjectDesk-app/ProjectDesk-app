import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { TaskStatus, UserRole } from "@prisma/client";
import { authOptions } from "../../auth/[...nextauth]";

type IncompleteTaskPayload = {
  id: number;
  title: string;
  status: TaskStatus;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.query;
    const projectId = Number(id);

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const body =
      req.body && typeof req.body === "object"
        ? (req.body as { forceComplete?: boolean })
        : {};
    const forceComplete = Boolean(body.forceComplete);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: true },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (session.user.role !== UserRole.ADMIN && project.supervisorId !== Number(session.user.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const incompleteTasks = project.tasks.filter(
      (t) => t.status !== TaskStatus.COMPLETE
    );

    if (incompleteTasks.length > 0 && !forceComplete) {
      const payload: IncompleteTaskPayload[] = incompleteTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
      }));

      return res.status(409).json({
        error: "Cannot complete project with unfinished tasks",
        code: "INCOMPLETE_TASKS",
        tasks: payload,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (incompleteTasks.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: incompleteTasks.map((task) => task.id) } },
          data: { status: TaskStatus.COMPLETE },
        });
      }

      return tx.project.update({
        where: { id: projectId },
        data: { isCompleted: true, status: "Completed" },
      });
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to complete project" });
  }
}
