import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const userRole = session.user?.role;
  if (userRole !== "SUPERVISOR" && userRole !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const flaggedTasks = await prisma.task.findMany({
      where: {
        flagged: true,
        ...(userRole === "ADMIN"
          ? {}
          : {
              project: {
                supervisorId: session.user.id,
              },
            }),
      },
      include: {
        project: { select: { title: true } },
        assignee: { select: { name: true, email: true } },
        flaggedBy: { select: { name: true, email: true } },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedTasks = flaggedTasks.map(task => ({
      ...task,
      flaggedByName: task.flaggedBy?.name || "Unknown (N/A)",
      flaggedAt: task.flaggedAt ? task.flaggedAt.toISOString() : task.updatedAt.toISOString(),
    }));

    res.status(200).json({ flaggedTasks: formattedTasks });
  } catch (error) {
    console.error("Error fetching assistance tasks:", error);
    res.status(500).json({ error: "Error loading flagged tasks" });
  }
}
