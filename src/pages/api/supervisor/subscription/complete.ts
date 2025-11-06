import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { completeRedirectFlow, createSubscription } from "@/lib/gocardless";
import { SubscriptionType } from "@prisma/client";

const REQUIRED_ENV_VARS = [
  "GOCARDLESS_SUBSCRIPTION_AMOUNT",
  "GOCARDLESS_SUBSCRIPTION_CURRENCY",
  "GOCARDLESS_SUBSCRIPTION_INTERVAL_UNIT",
];

const ensureBillingEnv = () => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing GoCardless configuration: ${missing.join(", ")}`);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  const { flowId } = req.body as { flowId?: string };
  if (!flowId) {
    return res.status(400).json({ error: "redirect_flow_id missing" });
  }

  const record = await prisma.goCardlessRedirectFlow.findUnique({
    where: { flowId },
  });
  if (!record || record.userId !== session.user.id) {
    return res.status(404).json({ error: "Redirect flow not found" });
  }
  if (record.completedAt) {
    return res.status(400).json({ error: "Redirect flow already completed" });
  }

  const supervisor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      subscriptionType: true,
      goCardlessSubscriptionId: true,
    },
  });
  if (!supervisor) {
    return res.status(404).json({ error: "Supervisor record missing" });
  }

  ensureBillingEnv();

  const sessionToken = record.sessionToken;

  try {
    const redirectFlow = await completeRedirectFlow(flowId, sessionToken);
    const mandateId = redirectFlow.links?.mandate;
    const customerId = redirectFlow.links?.customer;

    if (!mandateId || !customerId) {
      return res.status(502).json({ error: "GoCardless response missing mandate or customer" });
    }

    const subscriptionAmount = Number(process.env.GOCARDLESS_SUBSCRIPTION_AMOUNT);
    const subscriptionCurrency = process.env.GOCARDLESS_SUBSCRIPTION_CURRENCY as string;
    const intervalUnit = process.env.GOCARDLESS_SUBSCRIPTION_INTERVAL_UNIT as string;
    const interval = process.env.GOCARDLESS_SUBSCRIPTION_INTERVAL
      ? Number(process.env.GOCARDLESS_SUBSCRIPTION_INTERVAL)
      : 1;

    if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
      return res.status(500).json({ error: "Invalid subscription amount configuration" });
    }
    if (!interval || !Number.isFinite(interval) || interval <= 0) {
      return res.status(500).json({ error: "Invalid subscription interval configuration" });
    }

    let subscriptionName = process.env.GOCARDLESS_SUBSCRIPTION_NAME || "ProjectDesk Supervisor Subscription";

    if (subscriptionName.length > 255) {
      subscriptionName = subscriptionName.slice(0, 255);
    }

    const subscription = await createSubscription({
      amount: subscriptionAmount,
      currency: subscriptionCurrency,
      name: subscriptionName,
      intervalUnit,
      interval,
      mandateId,
      metadata: {
        userId: supervisor.id.toString(),
      },
    });

    await prisma.$transaction([
      prisma.goCardlessRedirectFlow.update({
        where: { id: record.id },
        data: { completedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: supervisor.id },
        data: {
          goCardlessCustomerId: customerId || null,
          goCardlessMandateId: mandateId || null,
          goCardlessSubscriptionId: subscription.id,
          goCardlessSubscriptionStatus: subscription.status,
          subscriptionType: SubscriptionType.SUBSCRIBED,
          subscriptionStartedAt: new Date(),
          subscriptionExpiresAt: null,
        },
      }),
    ]);

    return res.status(200).json({
      ok: true,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    });
  } catch (error: any) {
    console.error("GoCardless complete flow error", error);
    return res.status(502).json({ error: error?.message || "Unable to complete subscription setup" });
  }
}
