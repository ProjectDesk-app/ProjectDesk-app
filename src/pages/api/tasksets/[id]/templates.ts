import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { findManagedTaskSet, positiveId } from "@/lib/taskSetAccess";
import { validateTemplates } from "@/lib/taskSetSchedule";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role)) return res.status(403).json({ error: "Access denied" });
  const id = positiveId(req.query.id);
  if (!id) return res.status(400).json({ error: "Invalid task set ID" });
  try {
    const taskSet = await findManagedTaskSet(id, session.user);
    if (!taskSet) return res.status(404).json({ error: "Task set not found" });
    if (req.method === "GET") return res.status(200).json(taskSet.templates);
    if (req.method === "POST" || req.method === "PUT") {
      const existing = req.method === "PUT" ? taskSet.templates.find(t => t.id === positiveId(req.body.templateId)) : null;
      if (req.method === "PUT" && !existing) return res.status(404).json({ error: "Template not found in this task set" });
      let item;
      try {
        const input = { ...existing, ...req.body };
        // Preserve the legacy API's numeric-string inputs without turning blank or day zero into missing data.
        for (const field of ["duration", "startOffset", "dueOffset"]) {
          if (typeof input[field] === "string") input[field] = input[field] === "" ? null : Number(input[field]);
        }
        [item] = validateTemplates([input]);
        if (taskSet.templates.some(t => t.id !== existing?.id && t.title === item.title)) throw new Error("Each item needs a different title.");
        item.order = existing?.order ?? taskSet.templates.length;
      } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      const saved = existing ? await prisma.taskTemplate.update({ where: { id: existing.id }, data: item }) :
        await prisma.taskTemplate.create({ data: { ...item, taskSetId: id } });
      return res.status(existing ? 200 : 201).json(saved);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Task template error:", error);
    return res.status(500).json({ error: "Unable to save task template." });
  }
}
