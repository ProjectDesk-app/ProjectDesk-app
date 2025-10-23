import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

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

    const subject = `Progress update requested – ${project.title}`;
    const message = `
Hello,

Your supervisor (${project.supervisor?.name}) has requested a progress update 
for the project "${project.title}". 

Please log in to ProjectDesk to provide an update and flag any issues.

- ProjectDesk Team
    `;

    // Send to each recipient (mocked)
    await Promise.all(
      recipients.map((email) => sendEmail(email, subject, message))
    );

    return res.status(200).json({ message: "Update requests sent" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to send update requests" });
  }
}
