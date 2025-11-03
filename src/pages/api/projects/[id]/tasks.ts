import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProjectStatus } from "@/lib/updateProjectStatus";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  const projectId = Number(id);

  try {
    switch (req.method) {
      case "GET": {
        await updateProjectStatus(projectId);
        const tasks = await prisma.task.findMany({
          where: { projectId },
          orderBy: { dueDate: "asc" },
        });
        return res.status(200).json({ tasks });
      }

      case "POST": {
        const { title, description, startDate, dueDate, assignedUserIds } = req.body;
        if (!title) return res.status(400).json({ error: "Title is required" });

        const newTask = await prisma.task.create({
          data: {
            title,
            description,
            startDate: startDate ? new Date(startDate) : null,
            dueDate: dueDate ? new Date(dueDate) : null,
            projectId,
            assignedUsers: assignedUserIds?.length
              ? {
                  connect: assignedUserIds.map((userId: string) => ({
                    id: Number(userId),
                  })),
                }
              : undefined,
          },
        });

        return res.status(201).json(newTask);
      }

      default:
        res.setHeader("Allow", ["GET", "POST"]);
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err) {
    console.error("❌ Error fetching/creating tasks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
