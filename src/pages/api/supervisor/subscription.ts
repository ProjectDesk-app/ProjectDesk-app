import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { SubscriptionType } from "@prisma/client";
import {
  SUPERVISOR_SPONSOR_LIMIT,
  canSponsorAccounts,
} from "@/lib/subscriptions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  let supervisor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      subscriptionType: true,
      subscriptionStartedAt: true,
      subscriptionExpiresAt: true,
      sponsoredUsers: {
        select: { id: true },
      },
    },
  });

  if (!supervisor) {
    return res.status(404).json({ error: "Supervisor record not found" });
  }

  const now = new Date();
  if (
    supervisor.subscriptionType === SubscriptionType.SUBSCRIBED &&
    supervisor.subscriptionExpiresAt &&
    supervisor.subscriptionExpiresAt.getTime() < now.getTime()
  ) {
    supervisor = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        subscriptionType: SubscriptionType.CANCELLED,
      },
      select: {
        subscriptionType: true,
        subscriptionStartedAt: true,
        subscriptionExpiresAt: true,
        sponsoredUsers: {
          select: { id: true },
        },
      },
    });
  }
  const trialEndsAt = supervisor.subscriptionExpiresAt ?? null;
  const trialDaysRemaining =
    supervisor.subscriptionType === SubscriptionType.FREE_TRIAL && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;
  const trialExpired =
    supervisor.subscriptionType === SubscriptionType.FREE_TRIAL &&
    (!!trialEndsAt && trialEndsAt.getTime() < now.getTime());
  const isCancelled = supervisor.subscriptionType === SubscriptionType.CANCELLED;

  const canSponsor = canSponsorAccounts(supervisor.subscriptionType);

  res.status(200).json({
    subscriptionType: supervisor.subscriptionType,
    subscriptionStartedAt: supervisor.subscriptionStartedAt,
    subscriptionExpiresAt: supervisor.subscriptionExpiresAt,
    sponsoredCount: supervisor.sponsoredUsers.length,
    sponsorLimit: SUPERVISOR_SPONSOR_LIMIT,
    sponsorSlotsRemaining: Math.max(
      0,
      SUPERVISOR_SPONSOR_LIMIT - supervisor.sponsoredUsers.length
    ),
    canSponsor,
    trialDaysRemaining,
    trialExpired,
    isCancelled,
  });
}
