import type { NextApiRequest, NextApiResponse } from "next";

import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(["SUPERVISOR", "STUDENT", "COLLABORATOR"]);
const MAX_NAME_LENGTH = 120;
const MAX_CONTEXT_LENGTH = 2000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, role, context } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    context?: string;
  };

  const trimmedName = name?.trim() || "";
  const normalizedEmail = email?.trim().toLowerCase() || "";
  const requestedRole = role?.trim().toUpperCase() || "SUPERVISOR";
  const trimmedContext = context?.trim() || "";

  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: "Name must be 1-120 characters" });
  }
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (!VALID_ROLES.has(requestedRole)) {
    return res.status(400).json({ error: "Account type is invalid" });
  }
  if (!trimmedContext || trimmedContext.length > MAX_CONTEXT_LENGTH) {
    return res.status(400).json({ error: "Please provide a short reason for requesting access" });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail || !EMAIL_REGEX.test(adminEmail)) {
    console.error("Account request error", new Error("ADMIN_EMAIL is not configured."));
    return res.status(500).json({ error: "Account requests are not configured right now." });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
      subscriptionType: true,
      role: true,
    },
  });

  const requestedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date());
  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const accountStatus = existingUser
    ? existingUser.passwordHash && existingUser.emailVerified
      ? "Existing active account"
      : "Existing invited or incomplete account"
    : "No account";

  try {
    await sendEmail(
      adminEmail,
      "ProjectDesk account request",
      [
        "A new request for a ProjectDesk account has been submitted.",
        "",
        `Name: ${trimmedName}`,
        `Email: ${normalizedEmail}`,
        `Requested role: ${requestedRole}`,
        `Requested: ${requestedAt}`,
        `Account status: ${accountStatus}`,
        existingUser ? `Current role: ${existingUser.role}` : null,
        existingUser ? `Current subscription type: ${existingUser.subscriptionType}` : null,
        "",
        "Reason for access:",
        trimmedContext,
        "",
        `App: ${appUrl}`,
        "Invite this user from the Admin area if access should be granted.",
      ]
        .filter((line): line is string => line !== null)
        .join("\n")
    );
  } catch (error) {
    console.error("Account request email failed", error);
    return res.status(500).json({ error: "Unable to submit your account request right now" });
  }

  return res.status(202).json({
    message:
      "Your request has been sent to the ProjectDesk administrator. You will receive an invitation email if access is approved.",
  });
}
