import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  const fileId = Number(id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: "Invalid file ID" });
  }

  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    include: {
      project: {
        include: {
          supervisor: true,
          students: true,
          collaborators: true,
        },
      },
    },
  });

  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  // Check if user has permission to delete
  const userId = session.user.id;
  const userRole = session.user.role;
  const isProjectSupervisor = file.project.supervisorId === userId;
  const isFileOwner = file.addedById === userId;

  if (!isProjectSupervisor && !isFileOwner && userRole !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method === "DELETE") {
    await prisma.projectFile.delete({
      where: { id: fileId },
    });

    return res.status(200).json({ message: "File deleted successfully" });
  }

  if (req.method === "PATCH" || req.method === "PUT") {
    // Update file to connect/disconnect tasks
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ error: "taskIds must be an array" });
    }

    const updatedFile = await prisma.projectFile.update({
      where: { id: fileId },
      data: {
        connectedTasks: {
          set: taskIds.map((taskId: number) => ({ id: taskId })),
        },
      },
      include: {
        addedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        connectedTasks: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return res.status(200).json({ file: updatedFile });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
