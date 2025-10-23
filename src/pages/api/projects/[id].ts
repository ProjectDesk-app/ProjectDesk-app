import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";

type MemberInput = {
  id?: number;
  email: string;
  name?: string | null;
};

async function resolveMembers(inputs: MemberInput[] = [], role: "STUDENT" | "COLLABORATOR") {
  const resolved: { user: any; isNew: boolean }[] = [];

  for (const input of inputs) {
    if (!input?.email) continue;
    const email = input.email.trim().toLowerCase();
    if (!email) continue;

    let user = input.id
      ? await prisma.user.findUnique({ where: { id: input.id } })
      : await prisma.user.findUnique({ where: { email } });

    let isNew = false;
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: input.name?.trim() || null,
          role,
        },
      });
      isNew = true;
    } else if (user.role === "STUDENT" && role === "COLLABORATOR") {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: "COLLABORATOR" } });
    }

    resolved.push({ user, isNew });
  }

  const unique = new Map<number, { user: any; isNew: boolean }>();
  for (const entry of resolved) {
    unique.set(entry.user.id, entry);
  }
  return Array.from(unique.values());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "PUT") {
    try {
      const { title, description, startDate, endDate, category, members } = req.body;

      const existingProject = await prisma.project.findUnique({
        where: { id: Number(id) },
        include: {
          students: true,
          collaborators: true,
        },
      });

      if (!existingProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      const studentMembers = await resolveMembers(members?.students, "STUDENT");
      const collaboratorMembers = await resolveMembers(members?.collaborators, "COLLABORATOR");

      const updatedProject = await prisma.project.update({
        where: { id: Number(id) },
        data: {
          title,
          description,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          category,
          students: {
            set: studentMembers.map((entry) => ({ id: entry.user.id })),
          },
          collaborators: {
            set: collaboratorMembers.map((entry) => ({ id: entry.user.id })),
          },
        },
        include: {
          students: true,
          collaborators: true,
        },
      });

      const previousStudentIds = new Set(existingProject.students.map((user) => user.id));
      const previousCollaboratorIds = new Set(existingProject.collaborators.map((user) => user.id));

      const newlyAssigned = [
        ...studentMembers.filter((entry) => !previousStudentIds.has(entry.user.id)),
        ...collaboratorMembers.filter((entry) => !previousCollaboratorIds.has(entry.user.id)),
      ];

      await Promise.all(
        newlyAssigned.map((entry) =>
          sendEmail(
            entry.user.email,
            `You've been added to "${updatedProject.title}"`,
            `Hello ${entry.user.name || "there"},\n\nYou have been added to the project "${updatedProject.title}" on ProjectDesk.\nSign in with this email to view the project details.\n\nThanks,\nProjectDesk`
          )
        )
      );

      return res.status(200).json(updatedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      return res.status(500).json({ error: "Failed to update project" });
    }
  }

  if (req.method === "GET") {
    try {
      const project = await prisma.project.findUnique({
        where: { id: Number(id) },
        include: { students: true, collaborators: true, supervisor: true },
      });

      if (!project) return res.status(404).json({ error: "Project not found" });

      return res.status(200).json(project);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Error fetching project" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
