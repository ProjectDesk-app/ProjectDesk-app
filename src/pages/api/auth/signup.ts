import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/mailer";
import { UserRole } from "@prisma/client";
import { isEmailBlocked } from "@/lib/blockedEmails";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const allowedOrigins = Array.from(
    new Set(
      [
        process.env.MARKETING_SITE_URL,
        process.env.NEXT_PUBLIC_MARKETING_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NEXTAUTH_URL,
        "https://projectdesk.app",
        "https://www.projectdesk.app",
      ].filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const requestOrigin = req.headers.origin;
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, password, accountType, sponsorEmail } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    accountType?: string;
    sponsorEmail?: string;
  };

  const trimmedName = name?.trim() || "";
  const normalizedEmail = email?.trim().toLowerCase() || "";
  const desiredRole = accountType?.toUpperCase();

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (await isEmailBlocked(normalizedEmail)) {
    return res.status(403).json({ error: "This email address has been blocked from ProjectDesk" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (desiredRole && !["SUPERVISOR", "STUDENT", "COLLABORATOR"].includes(desiredRole)) {
    return res.status(400).json({ error: "Invalid account type" });
  }
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      role: true,
      passwordHash: true,
      sponsorId: true,
      supervisorId: true,
      subscriptionType: true,
      subscriptionExpiresAt: true,
    },
  });

  if (!existing) {
    return res.status(403).json({
      error:
        "ProjectDesk is currently a private beta. Please request an account and wait for an invitation before setting a password.",
    });
  }

  const passwordHash = await hash(password, 10);

  const token = generateToken(24);
  const expiresAt = tokenExpiry(48);

  let confirmationMessage =
    "Account created. Please check your email to activate it.";

  if (existing.passwordHash) {
    return res
      .status(409)
      .json({ error: "An account with this email already exists" });
  }

  const role = existing.role;
  const subscriptionType = existing.subscriptionType;

  if (role === UserRole.STUDENT || role === UserRole.COLLABORATOR) {
    confirmationMessage =
      "Account ready! Please verify your email to finish setting things up.";
  } else if (role === UserRole.SUPERVISOR) {
    confirmationMessage =
      "Account updated. Please verify your email to finish activation.";
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: trimmedName,
      passwordHash,
    },
  });

  const targetUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true },
  });

  if (!targetUser) {
    return res.status(500).json({ error: "Unable to create account" });
  }

  await prisma.emailVerification.deleteMany({ where: { userId: targetUser.id } });

  await prisma.emailVerification.create({
    data: {
      userId: targetUser.id,
      token,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verifyLink = `${baseUrl}/verify-email?token=${token}`;

  const greetingName = targetUser.name || trimmedName;

  await sendEmail(
    normalizedEmail,
    "Activate your ProjectDesk account",
    `Hello ${greetingName},\n\nWelcome to ProjectDesk! Please activate your account by visiting the link below:\n${verifyLink}\n\nIf you did not sign up, you can safely ignore this message.`
  );

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const subject = `[ProjectDesk] Invited ${role.toLowerCase()} activation`;
    const details = [
      `Name: ${greetingName}`,
      `Email: ${normalizedEmail}`,
      `Role: ${role}`,
      `Subscription type: ${subscriptionType}`,
    ];
    if (desiredRole && desiredRole !== role) {
      details.push(`Requested role: ${desiredRole}`);
    }
    const body = `Hello Bradley,\n\nAn invited user has activated their ProjectDesk account.\n\n${details.join(
      "\n"
    )}\n\nSign in to the Admin Dashboard if you need to review this account.\n\n— ProjectDesk`;
    try {
      await sendEmail(adminEmail, subject, body);
    } catch (error) {
      console.error("Failed to send admin signup notification", error);
    }
  }

  return res.status(201).json({ message: confirmationMessage });
}
