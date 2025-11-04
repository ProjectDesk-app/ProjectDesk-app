import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { SubscriptionType } from "@prisma/client";

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
    select: { id: true, sponsorId: true },
  });

  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  if (target.sponsorId !== session.user.id) {
    return res.status(403).json({ error: "You do not sponsor this user" });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      sponsorId: null,
      supervisorId: null,
      subscriptionType: SubscriptionType.FREE_TRIAL,
      subscriptionExpiresAt: new Date(),
    },
  });

  return res.status(204).end();
}
