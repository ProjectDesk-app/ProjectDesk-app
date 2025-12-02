import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]";
import { FileItemType } from "@prisma/client";

function normalizeType(value: unknown): FileItemType {
  if (typeof value !== "string") return FileItemType.FILE;
  const upper = value.toUpperCase();
  return upper === FileItemType.FOLDER ? FileItemType.FOLDER : FileItemType.FILE;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== "string" || Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  if (req.method === "GET") {
    try {
      const sortByDate = req.query.sort === "date";

      const files = await prisma.projectFile.findMany({
        where: { projectId: Number(id) },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: sortByDate
          ? { createdAt: "desc" }
          : [{ type: "desc" }, { name: "asc" }], // folders first (FOLDER > FILE) then alphabetical
      });

      return res.status(200).json({ files });
    } catch (error) {
      console.error("Error fetching project files:", error);
      return res.status(500).json({ error: "Failed to fetch files" });
    }
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const type = normalizeType(req.body?.type);

    if (!name) return res.status(400).json({ error: "Filename is required" });
    if (!url) return res.status(400).json({ error: "File URL is required" });

    try {
      const project = await prisma.project.findUnique({
        where: { id: Number(id) },
        select: { id: true },
      });
      if (!project) return res.status(404).json({ error: "Project not found" });

      const file = await prisma.projectFile.create({
        data: {
          name,
          url,
          type,
          projectId: project.id,
          userId: Number(session.user.id),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return res.status(201).json({ file });
    } catch (error) {
      console.error("Error creating project file:", error);
      return res.status(500).json({ error: "Failed to add file" });
    }
  }

  if (req.method === "PATCH") {
    const fileId = Number(req.body?.id);
    if (!fileId || Number.isNaN(fileId)) {
      return res.status(400).json({ error: "File ID is required" });
    }

    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    const url =
      typeof req.body?.url === "string" ? req.body.url.trim() : undefined;
    const type =
      req.body?.type !== undefined ? normalizeType(req.body.type) : undefined;

    try {
      const existing = await prisma.projectFile.findUnique({
        where: { id: fileId },
        select: { projectId: true },
      });
      if (!existing || existing.projectId !== Number(id)) {
        return res.status(404).json({ error: "File not found" });
      }

      const updated = await prisma.projectFile.update({
        where: { id: fileId },
        data: {
          name,
          url,
          type,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return res.status(200).json({ file: updated });
    } catch (error) {
      console.error("Error updating project file:", error);
      return res.status(500).json({ error: "Failed to update file" });
    }
  }

  if (req.method === "DELETE") {
    const fileId = Number(req.body?.id);
    if (!fileId || Number.isNaN(fileId)) {
      return res.status(400).json({ error: "File ID is required" });
    }

    try {
      const existing = await prisma.projectFile.findUnique({
        where: { id: fileId },
        select: { projectId: true },
      });
      if (!existing || existing.projectId !== Number(id)) {
        return res.status(404).json({ error: "File not found" });
      }

      await prisma.projectFile.delete({ where: { id: fileId } });
      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting project file:", error);
      return res.status(500).json({ error: "Failed to delete file" });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
