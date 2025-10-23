import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: taskId } = req.query;

  if (typeof taskId !== "string") {
    res.status(400).json({ error: "Invalid task ID" });
    return;
  }

  if (req.method === "GET") {
    try {
      const comments = await prisma.comment.findMany({
        where: { taskId: Number(taskId) },
        orderBy: { createdAt: "asc" },
        include: {
          User: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
      const formatted = comments.map(({ User, ...rest }) => ({
        ...rest,
        user: User,
      }));
      res.status(200).json(formatted);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  } else if (req.method === "POST") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;
    if (!session || !session.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { content } = req.body;
    if (typeof content !== "string" || content.trim() === "") {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    try {
      const comment = await prisma.comment.create({
        data: {
          content,
          User: { connect: { id: Number(session.user.id) } },
          task: { connect: { id: Number(taskId) } },
        },
        include: {
          User: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          task: {
            include: {
              assignedUsers: true,
              project: {
                include: {
                  supervisor: true,
                  students: true,
                  collaborators: true,
                  members: {
                    include: {
                      user: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const { project } = comment.task;
      const actorId = Number(session.user.id);
      const recipientMap = new Map<number, { id: number; name: string | null; email: string | null }>();

      const addRecipient = (user?: { id: number; name: string | null; email: string | null } | null) => {
        if (!user || typeof user.id !== "number") return;
        if (user.id === actorId) return;
        if (!recipientMap.has(user.id)) {
          recipientMap.set(user.id, { id: user.id, name: user.name || null, email: user.email || null });
        }
      };

      addRecipient(project.supervisor);
      project.students?.forEach(addRecipient);
      project.collaborators?.forEach(addRecipient);
      project.members?.forEach((member) => addRecipient(member?.user || null));
      comment.task.assignedUsers?.forEach(addRecipient);

      const recipients = Array.from(recipientMap.values());

      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((u) => ({
            actorId,
            recipientId: u.id,
            message: `${session.user.name || "Someone"} commented on "${comment.task.title}" in "${project.title}"`,
            taskId: comment.task.id,
            projectId: project.id,
            type: "new_comment",
          })),
        });
      }

      const { User, ...rest } = comment;
      res.status(201).json({ ...rest, user: User });
    } catch (error) {
      console.error("Error creating comment or notifications:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  } else if (req.method === "PATCH") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;
    if (!session || !session.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id, content } = req.body;
    if (!id || typeof content !== "string" || content.trim() === "") {
      res.status(400).json({ error: "Invalid data" });
      return;
    }

    try {
      const comment = await prisma.comment.findUnique({
        where: { id: Number(id) },
        select: { userId: true },
      });
      if (!comment) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      if (comment.userId !== session.user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const updated = await prisma.comment.update({
        where: { id: Number(id) },
        data: { content },
      });
      res.status(200).json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update comment" });
    }
  } else if (req.method === "DELETE") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;
    if (!session || !session.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: "Comment ID required" });
      return;
    }

    try {
      const comment = await prisma.comment.findUnique({
        where: { id: Number(id) },
        select: { userId: true },
      });
      if (!comment) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      if (comment.userId !== session.user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      await prisma.comment.delete({ where: { id: Number(id) } });
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete comment" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
