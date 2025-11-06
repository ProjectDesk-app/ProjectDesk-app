import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { SubscriptionType, UserRole } from "@prisma/client";
import {
  SUPERVISOR_SPONSOR_LIMIT,
  canSponsorAccounts,
} from "@/lib/subscriptions";
import { sendEmail } from "@/lib/mailer";

async function ensureSupervisor(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return session.user;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sessionUser = await ensureSupervisor(req, res);
  if (!sessionUser) return;

  if (req.method === "GET") {
    const [sponsored, requests] = await Promise.all([
      prisma.user.findMany({
        where: { sponsorId: sessionUser.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          subscriptionType: true,
          subscriptionStartedAt: true,
          subscriptionExpiresAt: true,
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      }),
      prisma.user.findMany({
        where: {
          supervisorId: sessionUser.id,
          sponsorId: null,
          role: { in: [UserRole.STUDENT, UserRole.COLLABORATOR] },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          subscriptionStartedAt: true,
        },
        orderBy: [{ createdAt: "asc" }],
      }),
    ]);

    return res.status(200).json({ sponsored, requests });
  }

  if (req.method === "POST") {
    const { userId } = (req.body ?? {}) as { userId?: number };

    if (!userId || typeof userId !== "number") {
      return res.status(400).json({ error: "userId is required" });
    }

    if (userId === sessionUser.id) {
      return res.status(400).json({ error: "You cannot sponsor yourself" });
    }

    const supervisor = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        subscriptionType: true,
        sponsoredUsers: {
          select: { id: true },
        },
      },
    });

    if (!supervisor) {
      return res.status(404).json({ error: "Supervisor record not found" });
    }

    if (!canSponsorAccounts(supervisor.subscriptionType)) {
      return res.status(403).json({
        error: "Only active subscribers can sponsor accounts",
      });
    }

    if (supervisor.sponsoredUsers.length >= SUPERVISOR_SPONSOR_LIMIT) {
      return res
        .status(400)
        .json({ error: `Sponsor limit of ${SUPERVISOR_SPONSOR_LIMIT} reached` });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        sponsorId: true,
        subscriptionType: true,
      },
    });

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (target.role === UserRole.SUPERVISOR || target.role === UserRole.ADMIN) {
      return res.status(400).json({
        error: "Only students or collaborators can be sponsored",
      });
    }

    if (target.sponsorId && target.sponsorId !== sessionUser.id) {
      return res.status(409).json({
        error: "User is already sponsored by another supervisor",
      });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        sponsorId: sessionUser.id,
        supervisorId: sessionUser.id,
        subscriptionType: SubscriptionType.SPONSORED,
        subscriptionExpiresAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subscriptionType: true,
        subscriptionStartedAt: true,
        subscriptionExpiresAt: true,
      },
    });

    if (updated.email) {
      await sendEmail(
        updated.email,
        "ProjectDesk sponsorship approved",
        `Hello ${updated.name || "there"},\n\n${
          sessionUser.role === "ADMIN" ? "An administrator" : "Your supervisor"
        } has approved your sponsorship on ProjectDesk (https://portal.projectdesk.app). You can now sign in and access your projects.\n\nThanks,\nProjectDesk`
      );
    }

    return res.status(200).json({ sponsored: updated });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end("Method Not Allowed");
}
