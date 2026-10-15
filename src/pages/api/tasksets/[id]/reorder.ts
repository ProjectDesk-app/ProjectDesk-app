import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findManagedTaskSet, positiveId } from "@/lib/taskSetAccess";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role)) return res.status(403).json({ error: "Access denied" });
  const id = positiveId(req.query.id), order = req.body.orderedTasks;
  if (!id || !Array.isArray(order)) return res.status(400).json({ error: "Invalid task order" });
  try {
    const taskSet = await findManagedTaskSet(id, session.user);
    if (!taskSet) return res.status(404).json({ error: "Task set not found" });
    const ids = order.map(t => positiveId(t?.id ?? t));
    if (ids.length !== taskSet.templates.length || new Set(ids).size !== ids.length ||
      ids.some(id => !id || !taskSet.templates.some(t => t.id === id))) {
      return res.status(400).json({ error: "Include each template in this set exactly once." });
    }
    await prisma.$transaction(ids.map((id, order) => prisma.taskTemplate.update({ where: { id }, data: { order } })));
    return res.status(200).json({ message: "Task order updated" });
  } catch (error) {
    console.error("Task reorder error:", error);
    return res.status(500).json({ error: "Unable to reorder templates." });
  }
}
