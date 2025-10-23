import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  const userRole = session?.user?.role;
  if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN")) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { id } = req.query;
  const taskSetId = parseInt(id as string, 10);

  if (isNaN(taskSetId)) {
    return res.status(400).json({ error: "Invalid TaskSet ID" });
  }

  try {
    // GET: Fetch all templates for this Task Set
    if (req.method === "GET") {
      const templates = await prisma.taskTemplate.findMany({
        where: { taskSetId },
        orderBy: { order: "asc" },
      });
      return res.status(200).json(templates);
    }

    // POST: Create a new template inside this Task Set
    if (req.method === "POST") {
      const { title, description, dueOffset, order, duration } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const newTemplate = await prisma.taskTemplate.create({
        data: {
          title,
          description: description || null,
          dueOffset: dueOffset ? Number(dueOffset) : null,
          duration: duration ? Number(duration) : null,
          order: order ? Number(order) : null,
          taskSetId,
        },
      });

      return res.status(201).json(newTemplate);
    }

    // PUT: Update a task template
    if (req.method === "PUT") {
      const { templateId, title, description, dueOffset, order, duration } = req.body;

      if (!templateId) {
        return res.status(400).json({ error: "Template ID is required" });
      }

      const updatedTemplate = await prisma.taskTemplate.update({
        where: { id: Number(templateId) },
        data: {
          title,
          description: description || null,
          dueOffset: dueOffset ? Number(dueOffset) : null,
          duration: duration ? Number(duration) : null,
          order: order ? Number(order) : null,
        },
      });

      return res.status(200).json(updatedTemplate);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Error in /api/tasksets/[id]/templates:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
