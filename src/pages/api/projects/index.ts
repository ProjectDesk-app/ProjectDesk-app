import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { sendEmail } from "@/lib/mailer";
import { SubscriptionType, UserRole } from "@prisma/client";
import {
  SUPERVISOR_SPONSOR_LIMIT,
  canSponsorAccounts,
} from "@/lib/subscriptions";
import { updateProjectStatus } from "@/lib/updateProjectStatus";

type MemberInput = {
  id?: number;
  email: string;
  name?: string | null;
};

async function resolveMembers(
  inputs: MemberInput[] = [],
  role: "STUDENT" | "COLLABORATOR"
) {
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
          sponsorSubscriptionInactive: false,
        },
      });
      isNew = true;
    } else if (user.role === "STUDENT" && role === "COLLABORATOR") {
      // Allow promoting collaborators if needed
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: "COLLABORATOR", sponsorSubscriptionInactive: false },
      });
    }

    resolved.push({ user, isNew });
  }

  // Deduplicate by user id/email
  const unique = new Map<number, { user: any; isNew: boolean }>();
  for (const entry of resolved) {
    unique.set(entry.user.id, entry);
  }
  return Array.from(unique.values());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;

  if (!session || !session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "POST") {
    try {
      const { title, description, startDate, endDate, category, members } = req.body;

      const studentMembers = await resolveMembers(members?.students, "STUDENT");
      const collaboratorMembers = await resolveMembers(
        members?.collaborators,
        "COLLABORATOR"
      );

      const sponsorAccount = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          subscriptionType: true,
          sponsoredUsers: { select: { id: true } },
        },
      });

      if (!sponsorAccount) {
        return res.status(404).json({ error: "Supervisor record not found" });
      }

      const potentialSponsorees = [...studentMembers, ...collaboratorMembers]
        .map((entry) => entry.user)
        .filter(
          (user) => user.role === UserRole.STUDENT || user.role === UserRole.COLLABORATOR
        );

      const conflictingSponsor = potentialSponsorees.find(
        (user) => user.sponsorId && user.sponsorId !== session.user.id
      );
      if (conflictingSponsor) {
        return res.status(409).json({
          error: `User ${conflictingSponsor.email} is already sponsored by another supervisor`,
        });
      }

      const additionalSponsorships = potentialSponsorees.filter(
        (user) => !user.sponsorId
      ).length;

      if (
        additionalSponsorships > 0 &&
        !canSponsorAccounts(sponsorAccount.subscriptionType)
      ) {
        return res.status(403).json({
          error: "An active subscription is required to sponsor additional accounts",
        });
      }

      const currentSponsoredCount = sponsorAccount.sponsoredUsers.length;
      if (
        currentSponsoredCount + additionalSponsorships >
        SUPERVISOR_SPONSOR_LIMIT
      ) {
        return res.status(400).json({
          error: `Sponsoring these members would exceed the limit of ${SUPERVISOR_SPONSOR_LIMIT} accounts`,
        });
      }

      const project = await prisma.project.create({
        data: {
          title,
          description,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          category: category || "student-project",
          supervisor: {
            connect: { email: session.user.email },
          },
          students: {
            connect: studentMembers.map((entry) => ({ id: entry.user.id })),
          },
          collaborators: {
            connect: collaboratorMembers.map((entry) => ({ id: entry.user.id })),
          },
        },
        include: {
          students: true,
          collaborators: true,
        },
      });

      const invitees = [...studentMembers, ...collaboratorMembers];
      const usersToSponsor = invitees
        .map((entry) => entry.user)
        .filter(
          (user) =>
            (user.role === UserRole.STUDENT || user.role === UserRole.COLLABORATOR) &&
            user.sponsorId !== session.user.id
        );

      if (usersToSponsor.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: usersToSponsor.map((user) => user.id) } },
          data: {
            sponsorId: session.user.id,
            supervisorId: session.user.id,
            subscriptionType: SubscriptionType.SPONSORED,
            subscriptionExpiresAt: null,
            sponsorSubscriptionInactive: false,
          },
        });
      }

      await Promise.all(
        invitees.map((entry) =>
          sendEmail(
            entry.user.email,
            `You're invited to join "${project.title}" on ProjectDesk`,
            `Hello ${entry.user.name || "there"},\n\nYou've been added to the project "${project.title}" on ProjectDesk (https://portal.projectdesk.app) by ${session.user.email}. You will need to enter their email address during the create account process.\nSign in or create an account using the email address you have received this notification at.\n\nThanks,\nProjectDesk`
          )
        )
      );

      return res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { category, isCompleted } = req.query;
    const where: any = {};

    if (session.user.role !== "ADMIN") {
      where.OR = [
        { supervisor: { email: session.user.email } },
        { students: { some: { email: session.user.email } } },
        { collaborators: { some: { email: session.user.email } } },
      ];
    }

    if (category) where.category = String(category);
    if (isCompleted !== undefined) {
      where.isCompleted = isCompleted === "true";
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        supervisor: {
          select: { id: true, name: true, email: true },
        },
        students: {
          select: { id: true, name: true, email: true },
        },
        collaborators: {
          select: { id: true, name: true, email: true },
        },
        tasks: {
          select: { id: true, title: true, dueDate: true, status: true },
        },
      },
      orderBy: [{ endDate: "asc" }, { title: "asc" }],
    });

    if (!projects || !Array.isArray(projects)) {
      return res.status(200).json([]);
    }

    await Promise.all(
      projects.map(async (project, index) => {
        if (project.isCompleted) return;
        const updated = await updateProjectStatus(project.id);
        if (updated?.status) {
          projects[index].status = updated.status;
        }
      })
    );

    return res.status(200).json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
