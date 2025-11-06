import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { randomBytes } from "crypto";

import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { createRedirectFlow, cancelSubscription } from "@/lib/gocardless";
import { SubscriptionType } from "@prisma/client";

const REQUIRED_ENV_VARS = [
  "GOCARDLESS_SUBSCRIPTION_AMOUNT",
  "GOCARDLESS_SUBSCRIPTION_CURRENCY",
  "GOCARDLESS_SUBSCRIPTION_INTERVAL_UNIT",
];

const baseUrl =
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

function buildSessionToken() {
  return randomBytes(32).toString("hex");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  const supervisor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      subscriptionType: true,
      goCardlessSubscriptionId: true,
      goCardlessCustomerId: true,
      goCardlessMandateId: true,
    },
  });

  if (!supervisor) {
    return res.status(404).json({ error: "Supervisor not found" });
  }

  if (req.method === "POST") {
    if (supervisor.subscriptionType === SubscriptionType.SUBSCRIBED && supervisor.goCardlessSubscriptionId) {
      return res.status(400).json({ error: "Subscription already active. Cancel it before starting a new one." });
    }

    const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
    if (missingEnv.length > 0) {
      return res.status(500).json({
        error: `Billing configuration incomplete. Missing environment variables: ${missingEnv.join(", ")}`,
      });
    }

    const sessionToken = buildSessionToken();

    const [firstName, ...rest] = (supervisor.name || "").split(" ").filter(Boolean);
    const familyName = rest.join(" ");

    try {
      const redirectFlow = await createRedirectFlow({
        description: "ProjectDesk supervisor subscription",
        sessionToken,
        successRedirectUrl: `${baseUrl.replace(/\/$/, "")}/supervisor/subscription/complete`,
        prefilledCustomer: {
          given_name: firstName || undefined,
          family_name: familyName || undefined,
          email: supervisor.email,
        },
        metadata: {
          userId: supervisor.id.toString(),
        },
      });

      await prisma.$transaction([
        prisma.goCardlessRedirectFlow.deleteMany({
          where: {
            userId: supervisor.id,
            completedAt: null,
          },
        }),
        prisma.goCardlessRedirectFlow.create({
          data: {
            userId: supervisor.id,
            flowId: redirectFlow.id,
            sessionToken,
          },
        }),
      ]);

      return res.status(200).json({
        redirectUrl: redirectFlow.redirect_url,
      });
    } catch (error: any) {
      console.error("GoCardless redirect flow error", error);
      return res.status(500).json({ error: error?.message || "Unable to start subscription" });
    }
  }

  if (req.method === "DELETE") {
    if (!supervisor.goCardlessSubscriptionId) {
      return res.status(400).json({ error: "No GoCardless subscription to cancel." });
    }

    try {
      await cancelSubscription(supervisor.goCardlessSubscriptionId);
    } catch (error: any) {
      console.error("GoCardless cancel subscription error", error);
      return res.status(502).json({ error: error?.message || "Unable to cancel subscription" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: supervisor.id },
        data: {
          subscriptionType: SubscriptionType.CANCELLED,
          subscriptionExpiresAt: new Date(),
          goCardlessSubscriptionStatus: "cancelled",
        },
      }),
      prisma.user.updateMany({
        where: { sponsorId: supervisor.id },
        data: { sponsorSubscriptionInactive: true },
      }),
    ]);

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["POST", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}
