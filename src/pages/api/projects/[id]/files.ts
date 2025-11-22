import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
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
  const projectId = Number(id);

  if (isNaN(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      supervisor: true,
      students: true,
      collaborators: true,
    },
  });

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  // Check if user has access to the project
  const userId = session.user.id;
  const userRole = session.user.role;
  const isProjectMember =
    project.supervisorId === userId ||
    project.students.some((s: any) => s.id === userId) ||
    project.collaborators.some((c: any) => c.id === userId);

  if (!isProjectMember && userRole !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method === "GET") {
    // Get all files for the project
    const files = await prisma.projectFile.findMany({
      where: { projectId },
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
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ files });
  }

  if (req.method === "POST") {
    // Add a new file
    const { fileName, fileUrl } = req.body;

    if (!fileName || !fileUrl) {
      return res.status(400).json({ error: "File name and URL are required" });
    }

    // Validate URL format
    try {
      new URL(fileUrl);
    } catch (error) {
      return res.status(400).json({ error: "Invalid file URL" });
    }

    const file = await prisma.projectFile.create({
      data: {
        projectId,
        fileName,
        fileUrl,
        addedById: userId,
      },
      include: {
        addedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.status(201).json({ file });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
