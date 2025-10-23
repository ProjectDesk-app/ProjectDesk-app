import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/mailer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  const trimmedName = name?.trim() || "";
  const normalizedEmail = email?.trim().toLowerCase() || "";

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await hash(password, 10);

  const token = generateToken(24);
  const expiresAt = tokenExpiry(48);

  const user = await prisma.user.create({
    data: {
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: "STUDENT",
      emailVerified: null,
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

  return res.status(201).json({ message: "Account created. Please check your email to activate it." });
}
