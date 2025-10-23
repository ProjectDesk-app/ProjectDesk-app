import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const { projectId } = req.body;

  if (!id || Array.isArray(id) || isNaN(Number(id))) {
    return res.status(400).json({ error: "Invalid or missing TaskSet ID" });
  }
  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  const numericProjectId = Number(projectId);
  if (isNaN(numericProjectId)) {
    return res.status(400).json({ error: "Invalid Project ID" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  const userRole = session?.user?.role;
  if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN")) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const taskSet = await prisma.taskSet.findUnique({
      where: { id: Number(id) },
      include: { templates: true },
    });

    if (!taskSet) {
      return res.status(404).json({ error: "TaskSet not found" });
    }

    if (!taskSet.templates?.length) {
      return res.status(400).json({ error: "TaskSet has no templates to apply" });
    }

    const project = await prisma.project.findUnique({
      where: { id: numericProjectId },
      select: { startDate: true },
    });

    if (!project?.startDate) {
      return res.status(400).json({ error: "Project not found or missing start date" });
    }

    const projectStartMs = new Date(project.startDate).getTime();

    // Create tasks from templates
    const createdTasks = await Promise.all(
      taskSet.templates.map(async (template) => {
        const dueDate =
          typeof template.dueOffset === "number"
            ? new Date(projectStartMs + template.dueOffset * 86400000)
            : null;

        return prisma.task.create({
          data: {
            title: template.title,
            description: template.description || null,
            dueDate,
            duration: template.duration ?? null,
            project: { connect: { id: numericProjectId } },
          },
        });
      })
    );

    return res.status(201).json({
      message: `Task Set "${taskSet.name}" applied successfully.`,
      tasksCreated: createdTasks.length,
    });
  } catch (error) {
    console.error("Error applying task set:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
