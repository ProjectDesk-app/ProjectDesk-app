import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "../../auth/[...nextauth]";

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

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, supervisorId: true },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (session.user.role !== UserRole.ADMIN && project.supervisorId !== Number(session.user.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        isCompleted: false,
        status: "On Track",
      },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Error reactivating project:", error);
    return res.status(500).json({ error: "Failed to reactivate project" });
  }
}
