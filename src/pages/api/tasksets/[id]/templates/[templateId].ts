import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { findManagedTaskSet, positiveId } from "@/lib/taskSetAccess";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role)) return res.status(403).json({ error: "Access denied" });
  const id = positiveId(req.query.id), templateId = positiveId(req.query.templateId);
  if (!id || !templateId) return res.status(400).json({ error: "Invalid task set or template ID" });
  try {
    const taskSet = await findManagedTaskSet(id, session.user);
    if (!taskSet || !taskSet.templates.some(t => t.id === templateId)) return res.status(404).json({ error: "Template not found" });
    await prisma.taskTemplate.delete({ where: { id: templateId } });
    return res.status(200).json({ message: "Template deleted" });
  } catch (error) {
    console.error("Template delete error:", error);
    return res.status(500).json({ error: "Unable to delete template." });
  }
}
