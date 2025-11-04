import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { SubscriptionType, type UserRole } from "@prisma/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { email, name, role } = req.body as { email?: string; name?: string; role?: string };
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalized = email.trim().toLowerCase();
  const allowedRoles: UserRole[] = ["ADMIN", "SUPERVISOR", "STUDENT", "COLLABORATOR"];
  const resolvedRole: UserRole = allowedRoles.includes(role as UserRole)
    ? (role as UserRole)
    : "STUDENT";
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: {
      name: name?.trim() || undefined,
      role: resolvedRole,
      subscriptionType: SubscriptionType.ADMIN_APPROVED,
      subscriptionExpiresAt: null,
    },
    create: {
      email: normalized,
      name: name?.trim() || null,
      role: resolvedRole,
      subscriptionType: SubscriptionType.ADMIN_APPROVED,
      subscriptionExpiresAt: null,
    },
  });

  await sendEmail(
    normalized,
    "You've been invited to ProjectDesk",
    `Hello ${user.name || "there"},\n\nYou've been invited to join ProjectDesk.\nSign in or create your account using this email address to get started.\n\nThanks,\nProjectDesk`
  );

  return res.status(200).json({ ok: true });
}
