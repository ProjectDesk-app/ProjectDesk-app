import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { sendTemplatedEmail } from "@/lib/emailTemplates";
import { getProjectLeadLabel } from "@/lib/projectLabels";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.query;
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as { recipientIds?: number[] })
        : {};

    const project = await prisma.project.findUnique({
      where: { id: Number(id) },
      include: { students: true, collaborators: true, supervisor: true },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });
    if (session.user.role !== UserRole.ADMIN && project.supervisorId !== Number(session.user.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const allMembers = [
      ...project.students.map((s) => ({ id: s.id, name: s.name, email: s.email })),
      ...project.collaborators.map((c) => ({ id: c.id, name: c.name, email: c.email })),
    ];

    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    const targetedMembers =
      recipientIds.length > 0
        ? allMembers.filter((member) => recipientIds.includes(member.id))
        : allMembers;

    if (targetedMembers.length === 0) {
      return res.status(400).json({ error: "No recipients to notify" });
    }

    const recipients = Array.from(
      new Set(targetedMembers.map((member) => member.email).filter(Boolean))
    );

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients to notify" });
    }

    const leadLabel = getProjectLeadLabel(project.category);
    await Promise.all(recipients.map(email => sendTemplatedEmail(email, 'project_update_requested', {
      recipientName: 'there', actorName: project.supervisor?.name || 'Your supervisor', projectTitle: project.title, leadLabel, supervisorName: project.supervisor?.name || 'Your supervisor',
      actionUrl: `${(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/projects/${project.id}`,
    })));

    return res.status(200).json({ message: "Update requests sent" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to send update requests" });
  }
}
