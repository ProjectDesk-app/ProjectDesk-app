import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { SubscriptionType } from "@prisma/client";
import { verifyWebhookSignature } from "@/lib/gocardless";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const SUBSCRIPTION_TERMINATION_ACTIONS = new Set(["cancelled", "expired", "finished", "failed"]);

const SUBSCRIPTION_ACTIVE_ACTIONS = new Set(["created", "customer_approval_granted", "active"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method not allowed");
  }

  const signature = req.headers["webhook-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).send("Missing webhook signature");
  }

  const webhookSecret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("GOCARDLESS_WEBHOOK_SECRET not configured");
    return res.status(500).send("Webhook secret not configured");
  }

  const rawBody = await getRawBody(req);

  const valid = verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!valid) {
    console.error("Invalid GoCardless webhook signature");
    return res.status(400).send("Invalid signature");
  }

  let events: any;
  try {
    events = JSON.parse(rawBody);
  } catch (error: any) {
    console.error("Failed to parse GoCardless webhook payload", error);
    return res.status(400).send("Invalid payload");
  }

  try {
    if (!events || !Array.isArray(events.events)) {
      return res.status(200).end();
    }

    for (const event of events.events) {
      const resourceType = event.resource_type;
      const action = event.action;

      if (resourceType === "subscriptions" && event.links?.subscription) {
        const subscriptionId = event.links.subscription as string;

        await prisma.$transaction(async (tx) => {
          const user = await tx.user.findFirst({
            where: { goCardlessSubscriptionId: subscriptionId },
            select: { id: true, subscriptionType: true },
          });

          if (!user) return;

          if (SUBSCRIPTION_TERMINATION_ACTIONS.has(action)) {
            await tx.user.update({
              where: { id: user.id },
              data: {
                subscriptionType: SubscriptionType.CANCELLED,
                subscriptionExpiresAt: new Date(),
                goCardlessSubscriptionStatus: action,
              },
            });
            await tx.user.updateMany({
              where: { sponsorId: user.id },
              data: { sponsorSubscriptionInactive: true },
            });
          } else if (SUBSCRIPTION_ACTIVE_ACTIONS.has(action)) {
            await tx.user.update({
              where: { id: user.id },
              data: {
                subscriptionType: SubscriptionType.SUBSCRIBED,
                subscriptionStartedAt: new Date(),
                subscriptionExpiresAt: null,
                goCardlessSubscriptionStatus: action,
              },
            });
            await tx.user.updateMany({
              where: { sponsorId: user.id },
              data: { sponsorSubscriptionInactive: false },
            });
          } else {
            await tx.user.update({
              where: { id: user.id },
              data: {
                goCardlessSubscriptionStatus: action,
              },
            });
          }
        });
      }

      if (resourceType === "mandates" && event.links?.mandate) {
        const mandateId = event.links.mandate as string;

        const termination = new Set(["cancelled", "expired", "failed"]);
        if (termination.has(action)) {
          await prisma.user.updateMany({
            where: { goCardlessMandateId: mandateId },
            data: {
              goCardlessMandateId: null,
              goCardlessSubscriptionStatus: action,
              subscriptionType: SubscriptionType.CANCELLED,
              subscriptionExpiresAt: new Date(),
              sponsorSubscriptionInactive: true,
            },
          });
        }
      }
    }

    return res.status(200).end();
  } catch (error: any) {
    console.error("Error processing GoCardless webhook", error);
    return res.status(500).end();
  }
}
