import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { SubscriptionType } from "@prisma/client";
import { sendEmail } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).end("Method Not Allowed");
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied" });
  }

  const userId = Number(req.query.userId);
  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, supervisorId: true, sponsorId: true, email: true, name: true },
  });

  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  if (target.supervisorId !== session.user.id || target.sponsorId) {
    return res.status(403).json({ error: "No pending sponsorship request for this user" });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      supervisorId: null,
      subscriptionType: SubscriptionType.FREE_TRIAL,
      subscriptionExpiresAt: new Date(),
    },
  });

  if (target.email) {
    await sendEmail(
      target.email,
      "ProjectDesk sponsorship request update",
      `Hello ${target.name || "there"},\n\nYour supervisor declined the sponsorship request for ProjectDesk. Please reach out to them if this was unexpected.\n\nThanks,\nProjectDesk`
    );
  }

  return res.status(204).end();
}
