import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/mailer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  const userId = Number(session?.user?.id);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body as { email?: string };
  const normalized = email?.trim().toLowerCase();

  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }

  const existing = await prisma.user.findFirst({ where: { email: normalized } });
  if (existing && existing.id !== userId) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.email === normalized) {
    return res.status(400).json({ error: "This is already your email" });
  }

  const token = generateToken(24);
  const expiresAt = tokenExpiry(24);

  await prisma.$transaction([
    prisma.emailVerification.deleteMany({ where: { userId } }),
    prisma.emailVerification.create({
      data: {
        userId,
        newEmail: normalized,
        token,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: normalized },
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verifyLink = `${baseUrl}/verify-email?token=${token}`;

  await sendEmail(
    normalized,
    "Confirm your new ProjectDesk email",
    `Hello ${user.name || "there"},\n\nPlease confirm your new email address by visiting the link below:\n${verifyLink}\n\nIf you did not request this change, please ignore this message.`
  );

  return res.status(200).json({ message: "Verification email sent" });
}
