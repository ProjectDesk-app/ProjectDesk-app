import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", ["PUT"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  const { orderedTasks } = req.body;

  if (!id || !Array.isArray(orderedTasks) || orderedTasks.length === 0) {
    return res.status(400).json({ error: "Invalid or empty task order payload." });
  }

  try {
    await Promise.all(
      orderedTasks.map((task, index) => {
        const taskId = parseInt(task.id ?? task, 10); // handle both objects and strings
        const order = typeof task.order === "number" ? task.order : index;
        if (isNaN(taskId)) return null;

        return prisma.taskTemplate.update({
          where: { id: taskId },
          data: { order },
        });
      })
    );

    return res.status(200).json({ message: "Tasks reordered successfully." });
  } catch (error) {
    console.error("❌ Error reordering tasks:", error);
    return res.status(500).json({ error: "Failed to reorder tasks." });
  }
}