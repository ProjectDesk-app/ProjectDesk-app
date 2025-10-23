import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;

  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userRole = session.user.role;
  if (userRole !== "SUPERVISOR" && userRole !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  const supervisorId = session.user.id;

  try {
    switch (req.method) {
      case "GET": {
        const taskSets = await prisma.taskSet.findMany({
          where:
            userRole === "ADMIN"
              ? {}
              : {
                  supervisorId,
                },
          include: {
            templates: true,
            supervisor: true,
          },
          orderBy: { createdAt: "desc" },
        });
        return res.status(200).json(taskSets);
      }

      case "POST": {
        const { name, templates } = req.body;

        if (!name) {
          return res.status(400).json({ error: "Name is required" });
        }

        const newTaskSet = await prisma.taskSet.create({
          data: {
            name,
            supervisorId,
            templates: templates
              ? {
                  create: templates.map((t: any) => ({
                    title: t.title,
                    description: t.description || "",
                    dueDaysOffset: t.dueDaysOffset || 0,
                  })),
                }
              : undefined,
          },
          include: { templates: true },
        });

        return res.status(201).json(newTaskSet);
      }

      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in /api/tasksets:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
