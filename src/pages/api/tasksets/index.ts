import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { parseCalendarDate, validateTemplates } from "@/lib/taskSetSchedule";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role)) return res.status(403).json({ error: "Access denied" });
  try {
    if (req.method === "GET") {
      const taskSets = await prisma.taskSet.findMany({
        where: session.user.role === "ADMIN" ? {} : { supervisorId: Number(session.user.id) },
        include: { templates: { orderBy: [{ order: "asc" }, { id: "asc" }] }, supervisor: true },
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json(taskSets);
    }
    if (req.method === "POST") {
      let templates, scheduleStartDate;
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 200) return res.status(400).json({ error: "Provide a name of up to 200 characters." });
      try {
        templates = validateTemplates(req.body.templates ?? []);
        scheduleStartDate = req.body.scheduleStartDate ? parseCalendarDate(req.body.scheduleStartDate) : null;
      } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      const taskSet = await prisma.taskSet.create({ data: {
        name, supervisorId: Number(session.user.id), scheduleStartDate,
        templates: { create: templates },
      }, include: { templates: true } });
      return res.status(201).json(taskSet);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Task set error:", error);
    return res.status(500).json({ error: "Unable to save or load task sets." });
  }
}
