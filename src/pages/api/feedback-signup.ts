import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/mailer";
import { isEmailBlocked } from "@/lib/blockedEmails";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const input = req.body || {};
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const trackingToken = typeof input.token === "string" ? input.token : "";
  if (!/^[a-f0-9]{48,128}$/i.test(trackingToken) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 150 || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Enter your name, a valid email, and a password of 8–128 characters using your tracking link." });
  }
  try {
    const review = await prisma.feedbackReview.findUnique({ where: { trackingToken }, include: { work: true } });
    if (!review || review.work.recipientEmail.toLowerCase() !== email) {
      return res.status(403).json({ error: "Use the email address that received this tracking link." });
    }
    if (await isEmailBlocked(email)) return res.status(403).json({ error: "This email address has been blocked from ProjectDesk" });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) return res.status(409).json({ error: "An account already exists. Sign in, or use Forgot password." });
    const passwordHash = await hash(password, 12);
    const token = generateToken(24);
    await prisma.$transaction(async (tx) => {
      let userId: number;
      if (existing) {
        const claimed = await tx.user.updateMany({ where: { id: existing.id, passwordHash: null }, data: { name, passwordHash, emailVerified: null } });
        if (!claimed.count) throw new Error("ACCOUNT_EXISTS");
        userId = existing.id;
      } else {
        const user = await tx.user.create({ data: { email, name, passwordHash, role: "STUDENT", subscriptionType: "SPONSORED", sponsorSubscriptionInactive: true, feedbackOnly: true } });
        userId = user.id;
      }
      await tx.emailVerification.deleteMany({ where: { userId } });
      await tx.emailVerification.create({ data: { userId, token, expiresAt: tokenExpiry(48) } });
    });
    const baseUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    try {
      await sendEmail(email, "Verify your email for Feedback Hub", `Hello,\n\nPlease verify your email to see your full feedback history:\n${baseUrl}/verify-email?token=${token}&feedback=1\n\nFeedback tracking is free. Your drafts and feedback are exchanged directly with your supervisor.\n\nIf you did not create this account, you can ignore this message.`);
    } catch {
      return res.status(201).json({ message: "Your account was created, but the verification email could not be sent. Sign in to request another verification email." });
    }
    return res.status(201).json({ message: "Account ready. Check your email to verify your address, then sign in to Feedback Hub." });
  } catch (error: any) {
    if (error?.code === "P2002" || error?.message === "ACCOUNT_EXISTS") return res.status(409).json({ error: "An account already exists. Sign in, or use Forgot password." });
    console.error("Feedback signup failed", error);
    return res.status(500).json({ error: "Unable to create your account. Please try again." });
  }
}
