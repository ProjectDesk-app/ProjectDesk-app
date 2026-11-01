import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendTemplatedEmail } from '@/lib/emailTemplates';
import { isEmailBlocked } from "@/lib/blockedEmails";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body as { email?: string };
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (await isEmailBlocked(normalizedEmail)) {
    return res.status(403).json({ error: "This email address has been blocked from ProjectDesk" });
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return res.status(404).json({ error: "No account found with that email address" });
  }

  const token = generateToken(32);
  const expiresAt = tokenExpiry(2); // 2 hours

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetLink = `${baseUrl}/reset-password?token=${token}`;

  try {
    await sendTemplatedEmail(normalizedEmail, 'account.password-reset', { recipientName: user.name || 'there', actionUrl: resetLink });
  } catch (error) {
    console.error("Password reset email failed:", error);
    return res
      .status(500)
      .json({ error: "We couldn’t send the reset email. Please try again shortly." });
  }

  return res.status(200).json({ message: "Password reset email sent" });
}
