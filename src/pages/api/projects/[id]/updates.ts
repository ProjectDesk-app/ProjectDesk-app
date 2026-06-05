import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { authOptions } from "../../auth/[...nextauth]";

function parseUpdateDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== "string" || Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  if (req.method === "GET") {
    try {
      const updates = await prisma.projectUpdate.findMany({
        where: { projectId: Number(id) },
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return res.status(200).json({ updates });
    } catch (error) {
      console.error("Error fetching project updates:", error);
      return res.status(500).json({ error: "Failed to fetch project updates" });
    }
  }

  if (req.method === "POST") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";
    const notifyAll =
      req.body?.notifyAll === false ? false : true;
    const updateDate = parseUpdateDate(req.body?.updateDate);

    if (!title) {
      return res.status(400).json({ error: "Update title is required" });
    }

    try {
      const project = await prisma.project.findUnique({
        where: { id: Number(id) },
        include: {
          supervisor: true,
          students: true,
          collaborators: true,
          members: {
            include: { user: true },
          },
        },
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const update = await prisma.projectUpdate.create({
        data: {
          title,
          description: description || null,
          notifyAll,
          ...(updateDate ? { createdAt: updateDate } : {}),
          projectId: project.id,
          userId: Number(session.user.id),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (notifyAll) {
        const actorId = Number(session.user.id);
        const recipientMap = new Map<number, { id: number; email: string | null }>();

        const addRecipient = (user?: { id: number; email: string | null } | null) => {
          if (!user || typeof user.id !== "number") return;
          if (user.id === actorId) return;
          if (!recipientMap.has(user.id)) {
            recipientMap.set(user.id, { id: user.id, email: user.email || null });
          }
        };

        addRecipient(project.supervisor);
        project.students?.forEach(addRecipient);
        project.collaborators?.forEach(addRecipient);
        project.members?.forEach((member) => addRecipient(member?.user || null));

        const recipients = Array.from(recipientMap.values()).filter(
          (entry) => !!entry.email
        );

        if (recipients.length > 0) {
          const subject = `New project update: ${update.title} – ${project.title}`;
          const actorName = session.user.name || "A team member";
          const messageLines = [
            `Hello,`,
            ``,
            `${actorName} posted a new update in "${project.title}".`,
            ``,
            `Update title: ${update.title}`,
          ];

          if (description) {
            messageLines.push("", `Details: ${description}`);
          }

          messageLines.push("", "Sign in to ProjectDesk to see all updates.", "", "- ProjectDesk");

          const message = messageLines.join("\n");

          await Promise.all(
            recipients.map((recipient) =>
              sendEmail(recipient.email as string, subject, message)
            )
          );
        }
      }

      return res.status(201).json({ update });
    } catch (error) {
      console.error("Error creating project update:", error);
      return res.status(500).json({ error: "Failed to create project update" });
    }
  }

  if (req.method === "PUT") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updateId = Number(req.body?.id);
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";
    const updateDate = parseUpdateDate(req.body?.updateDate);

    if (!Number.isInteger(updateId) || updateId <= 0) {
      return res.status(400).json({ error: "Invalid update ID" });
    }

    if (!title) {
      return res.status(400).json({ error: "Update title is required" });
    }

    if (!updateDate) {
      return res.status(400).json({ error: "Update date is required" });
    }

    try {
      const existingUpdate = await prisma.projectUpdate.findUnique({
        where: { id: updateId },
        select: { id: true, projectId: true, userId: true },
      });

      if (!existingUpdate || existingUpdate.projectId !== Number(id)) {
        return res.status(404).json({ error: "Project update not found" });
      }

      if (existingUpdate.userId !== Number(session.user.id)) {
        return res.status(403).json({ error: "Only the update author can edit this update" });
      }

      const update = await prisma.projectUpdate.update({
        where: { id: updateId },
        data: {
          title,
          description: description || null,
          createdAt: updateDate,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return res.status(200).json({ update });
    } catch (error) {
      console.error("Error updating project update:", error);
      return res.status(500).json({ error: "Failed to update project update" });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
