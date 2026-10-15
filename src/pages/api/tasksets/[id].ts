import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { findManagedTaskSet, positiveId } from "@/lib/taskSetAccess";
import { parseCalendarDate, validateTemplates } from "@/lib/taskSetSchedule";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role)) return res.status(403).json({ error: "Access denied" });
  const id = positiveId(req.query.id);
  if (!id) return res.status(400).json({ error: "Invalid task set ID" });
  try {
    const taskSet = await findManagedTaskSet(id, session.user);
    if (!taskSet) return res.status(404).json({ error: "Task set not found" });
    if (req.method === "GET") return res.status(200).json(taskSet);
    if (req.method === "PUT") {
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 200) return res.status(400).json({ error: "Provide a name of up to 200 characters." });
      let templates, scheduleStartDate;
      try {
        if (req.body.templates !== undefined) templates = validateTemplates(req.body.templates);
        if (req.body.scheduleStartDate !== undefined) scheduleStartDate = req.body.scheduleStartDate ? parseCalendarDate(req.body.scheduleStartDate) : null;
      } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      // Nested writes replace the schedule atomically; project tasks are independent copies.
      const updated = await prisma.taskSet.update({ where: { id }, data: {
        name, scheduleStartDate,
        ...(templates !== undefined ? { templates: { deleteMany: {}, create: templates } } : {}),
      }, include: { templates: { orderBy: [{ order: "asc" }, { id: "asc" }] } } });
      return res.status(200).json(updated);
    }
    if (req.method === "DELETE") {
      await prisma.taskSet.delete({ where: { id } });
      return res.status(204).end();
    }
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Task set error:", error);
    return res.status(500).json({ error: "Unable to update task set." });
  }
}
