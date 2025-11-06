import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/mailer";
import { SubscriptionType, UserRole } from "@prisma/client";

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
  const desiredRole = (accountType || "SUPERVISOR").toUpperCase();
  const normalizedSponsorEmail = sponsorEmail?.trim().toLowerCase() || "";

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!["SUPERVISOR", "STUDENT", "COLLABORATOR"].includes(desiredRole)) {
    return res.status(400).json({ error: "Invalid account type" });
  }
  if (
    (desiredRole === "STUDENT" || desiredRole === "COLLABORATOR") &&
    !normalizedSponsorEmail
  ) {
    return res
      .status(400)
      .json({ error: "Please provide the email address of your supervisor" });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await hash(password, 10);

  const token = generateToken(24);
  const expiresAt = tokenExpiry(48);

  let sponsorId: number | null = null;
  let supervisorId: number | null = null;
  let subscriptionType: SubscriptionType = SubscriptionType.FREE_TRIAL;
  let subscriptionExpiresAt: Date | null = null;
  let role: UserRole = UserRole.SUPERVISOR;
  let confirmationMessage =
    "Account created. Please check your email to activate it.";

  if (desiredRole === "SUPERVISOR") {
    role = UserRole.SUPERVISOR;
    subscriptionType = SubscriptionType.FREE_TRIAL;
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 8);
    subscriptionExpiresAt = trialEnds;
    confirmationMessage =
      "Welcome to ProjectDesk! Confirm your email and start your free 8-day trial.";
  } else {
    role = desiredRole === "STUDENT" ? UserRole.STUDENT : UserRole.COLLABORATOR;
    const sponsorAccount = await prisma.user.findUnique({
      where: { email: normalizedSponsorEmail },
      select: { id: true, role: true, subscriptionType: true },
    });

    if (!sponsorAccount || (sponsorAccount.role !== UserRole.SUPERVISOR && sponsorAccount.role !== UserRole.ADMIN)) {
      return res
        .status(404)
        .json({ error: "We couldn't find a supervisor with that email address" });
    }

    supervisorId = sponsorAccount.id;
    subscriptionType = SubscriptionType.SPONSORED;
    subscriptionExpiresAt = null;
    sponsorId = null;
    confirmationMessage =
      "Account created. Please verify your email while we notify your supervisor for sponsorship approval.";

    await sendEmail(
      normalizedSponsorEmail,
      "New sponsorship request on ProjectDesk",
      `Hello,\n\n${trimmedName} (${normalizedEmail}) has requested access to ProjectDesk as your sponsored ${
        role === UserRole.STUDENT ? "student" : "collaborator"
      }.\n\nVisit the Supervisor Dashboard to approve or decline this request.\n\nThanks,\nProjectDesk`
    );
  }

  const user = await prisma.user.create({
    data: {
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role,
      emailVerified: null,
      supervisorId,
      sponsorId,
      subscriptionType,
      subscriptionExpiresAt,
    },
  });

  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verifyLink = `${baseUrl}/verify-email?token=${token}`;

  await sendEmail(
    normalizedEmail,
    "Activate your ProjectDesk account",
    `Hello ${trimmedName},\n\nWelcome to ProjectDesk! Please activate your account by visiting the link below:\n${verifyLink}\n\nIf you did not sign up, you can safely ignore this message.`
  );

  return res.status(201).json({ message: confirmationMessage });
}
