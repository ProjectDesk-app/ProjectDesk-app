import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { SubscriptionType, type UserRole } from "@prisma/client";
import { isEmailBlocked } from "@/lib/blockedEmails";

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
  if (await isEmailBlocked(normalized)) {
    return res.status(403).json({ error: "This email address has been blocked from ProjectDesk" });
  }
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

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const setupUrl = `${baseUrl.replace(/\/$/, "")}/signup`;

  await sendEmail(
    normalized,
    "You've been invited to ProjectDesk",
    `Hello ${user.name || "there"},\n\nYou've been invited to join ProjectDesk.\nUse the link below to set your password and activate your account with this email address:\n${setupUrl}\n\nThanks,\nProjectDesk`
  );

  return res.status(200).json({ ok: true });
}
