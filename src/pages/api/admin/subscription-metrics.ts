import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { SubscriptionType } from "@prisma/client";

const EMPTY_SUMMARY: Record<SubscriptionType, number> = {
  ADMIN_APPROVED: 0,
  SUBSCRIBED: 0,
  FREE_TRIAL: 0,
  SPONSORED: 0,
  CANCELLED: 0,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const summaryRaw = await prisma.user.groupBy({
    by: ["subscriptionType"],
    _count: { _all: true },
  });

  const summary = { ...EMPTY_SUMMARY };
  for (const entry of summaryRaw) {
    summary[entry.subscriptionType] = entry._count._all;
  }

  const totalUsers = summaryRaw.reduce((sum, entry) => sum + entry._count._all, 0);
  const activeSubscribers = (summary[SubscriptionType.SUBSCRIBED] ?? 0) + (summary[SubscriptionType.ADMIN_APPROVED] ?? 0);
  const freeTrials = summary[SubscriptionType.FREE_TRIAL] ?? 0;
  const sponsoredAccounts = summary[SubscriptionType.SPONSORED] ?? 0;
  const cancelledAccounts = summary[SubscriptionType.CANCELLED] ?? 0;

  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(now.getDate() + 7);

  const freeTrialsEndingSoonRaw = await prisma.user.findMany({
    where: {
      role: "SUPERVISOR",
      subscriptionType: SubscriptionType.FREE_TRIAL,
      subscriptionExpiresAt: {
        not: null,
        gte: now,
        lte: inSevenDays,
      },
    },
    orderBy: { subscriptionExpiresAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      subscriptionExpiresAt: true,
    },
    take: 6,
  });

  const cancelledSupervisors = await prisma.user.findMany({
    where: {
      role: "SUPERVISOR",
      subscriptionType: SubscriptionType.CANCELLED,
    },
    orderBy: { subscriptionExpiresAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      goCardlessSubscriptionStatus: true,
    },
    take: 6,
  });

  const sponsorAlertsCount = await prisma.user.count({
    where: { sponsorSubscriptionInactive: true },
  });

  const sponsorAlertsUsers = await prisma.user.findMany({
    where: { sponsorSubscriptionInactive: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      sponsor: {
        select: {
          name: true,
          email: true,
        },
      },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const goCardlessStatusCountsRaw = await prisma.user.groupBy({
    by: ["goCardlessSubscriptionStatus"],
    where: {
      goCardlessSubscriptionStatus: { not: null },
    },
    _count: { _all: true },
  });

  const freeTrialsEndingSoon = freeTrialsEndingSoonRaw.map((trial) => {
    const expiresAt = trial.subscriptionExpiresAt;
    let daysRemaining: number | null = null;
    if (expiresAt) {
      const msDiff = expiresAt.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
    }
    return {
      id: trial.id,
      name: trial.name,
      email: trial.email,
      subscriptionExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining,
    };
  });

  const sponsorAlerts = {
    impactedCount: sponsorAlertsCount,
    users: sponsorAlertsUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sponsorName: user.sponsor?.name ?? null,
      sponsorEmail: user.sponsor?.email ?? null,
    })),
  };

  const goCardlessStatusCounts = goCardlessStatusCountsRaw
    .filter((entry) => entry.goCardlessSubscriptionStatus)
    .map((entry) => ({
      status: entry.goCardlessSubscriptionStatus as string,
      count: entry._count._all,
    }));

  res.status(200).json({
    summary,
    totals: {
      totalUsers,
      activeSubscribers,
      freeTrials,
      sponsoredAccounts,
      cancelledAccounts,
    },
    freeTrialsEndingSoon,
    cancelledSupervisors,
    sponsorAlerts,
    goCardlessStatusCounts,
  });
}
