import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findManagedTaskSet, positiveId } from "@/lib/taskSetAccess";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = (await getServerSession(req, res, authOptions as any)) as any;
    const userRole = session?.user?.role;
    if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN")) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.query;
    const taskSetId = positiveId(id);
    if (!taskSetId) {
      return res.status(400).json({ error: "Invalid task set ID" });
    }

    // Fetch original task set with its templates
    const original = await findManagedTaskSet(taskSetId, session.user);

    if (!original) {
      return res.status(404).json({ error: "Task set not found" });
    }

    // Create a copy of the task set
    const duplicated = await prisma.taskSet.create({
      data: {
        name: `${original.name} (Copy)`,
        supervisorId: original.supervisorId,
        scheduleStartDate: original.scheduleStartDate,
        templates: {
          create: original.templates.map((t) => ({
            title: t.title,
            description: t.description,
            dueOffset: t.dueOffset,
            startOffset: t.startOffset,
            duration: t.duration,
            dueTime: t.dueTime,
            kind: t.kind,
            order: t.order,
          })),
        },
      },
      include: { templates: true },
    });

    return res.status(200).json(duplicated);
  } catch (error) {
    console.error("Error duplicating task set:", error);
    return res.status(500).json({ error: "Failed to duplicate task set." });
  }
}
