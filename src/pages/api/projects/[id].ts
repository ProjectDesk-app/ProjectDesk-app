import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { SubscriptionType, UserRole } from "@prisma/client";
import {
  SUPERVISOR_SPONSOR_LIMIT,
  canSponsorAccounts,
} from "@/lib/subscriptions";

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
      const collaboratorMembers = await resolveMembers(
        members?.collaborators,
        "COLLABORATOR"
      );

      const supervisorAccount = await prisma.user.findUnique({
        where: { id: existingProject.supervisorId },
        select: {
          id: true,
          subscriptionType: true,
          sponsoredUsers: {
            select: { id: true },
          },
        },
      });

      if (!supervisorAccount) {
        return res.status(404).json({ error: "Supervisor record not found" });
      }

      const potentialSponsorees = [...studentMembers, ...collaboratorMembers]
        .map((entry) => entry.user)
        .filter(
          (user) => user.role === UserRole.STUDENT || user.role === UserRole.COLLABORATOR
        );
      const uniquePotentialSponsorees = Array.from(
        new Map(potentialSponsorees.map((user) => [user.id, user])).values()
      );

      const conflictingSponsor = uniquePotentialSponsorees.find(
        (user) => user.sponsorId && user.sponsorId !== supervisorAccount.id
      );
      if (conflictingSponsor) {
        return res.status(409).json({
          error: `User ${conflictingSponsor.email} is already sponsored by another supervisor`,
        });
      }

      const additionalSponsorships = uniquePotentialSponsorees.filter(
        (user) => !user.sponsorId
      ).length;

      if (
        additionalSponsorships > 0 &&
        !canSponsorAccounts(supervisorAccount.subscriptionType)
      ) {
        return res.status(403).json({
          error: "An active subscription is required to sponsor additional accounts",
        });
      }

      if (
        supervisorAccount.sponsoredUsers.length + additionalSponsorships >
        SUPERVISOR_SPONSOR_LIMIT
      ) {
        return res.status(400).json({
          error: `Sponsoring these members would exceed the limit of ${SUPERVISOR_SPONSOR_LIMIT} accounts`,
        });
      }

      const previousStudentIds = new Set(existingProject.students.map((user) => user.id));
      const previousCollaboratorIds = new Set(
        existingProject.collaborators.map((user) => user.id)
      );

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

      const newlyAssigned = [
        ...studentMembers.filter((entry) => !previousStudentIds.has(entry.user.id)),
        ...collaboratorMembers.filter((entry) => !previousCollaboratorIds.has(entry.user.id)),
      ];

      const usersToSponsor = uniquePotentialSponsorees.filter(
        (user) => user.sponsorId !== supervisorAccount.id
      );

      if (usersToSponsor.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: usersToSponsor.map((user) => user.id) } },
          data: {
            sponsorId: supervisorAccount.id,
            supervisorId: supervisorAccount.id,
            subscriptionType: SubscriptionType.SPONSORED,
            subscriptionExpiresAt: null,
          },
        });
      }

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
