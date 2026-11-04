import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { isEmailBlocked } from "@/lib/blockedEmails";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const token = req.body?.token as string | undefined;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token is required" });
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
  });

  if (!verification) {
    return res.status(404).json({ error: "This verification link has already been used or replaced. Try signing in. If your email still needs verification, signing in will send a new link." });
  }

  if (verification.expiresAt < new Date()) {
    await prisma.emailVerification.delete({ where: { token } });
    return res.status(410).json({ error: "This verification link has expired. Please sign in to request a new verification email." });
  }

  const user = await prisma.user.findUnique({ where: { id: verification.userId } });
  if (!user) {
    await prisma.emailVerification.delete({ where: { token } });
    return res.status(404).json({ error: "User not found" });
  }

  if (await isEmailBlocked(user.email)) {
    await prisma.emailVerification.delete({ where: { token } });
    if (verification.newEmail) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pendingEmail: null },
      });
    }
    return res.status(403).json({ error: "This email address has been blocked from ProjectDesk" });
  }

  const now = new Date();
  let message = "Email verified";

  if (verification.newEmail) {
    if (await isEmailBlocked(verification.newEmail)) {
      await prisma.emailVerification.delete({ where: { token } });
      await prisma.user.update({
        where: { id: user.id },
        data: { pendingEmail: null },
      });
      return res.status(403).json({ error: "This email address has been blocked from ProjectDesk" });
    }

    const existing = await prisma.user.findFirst({ where: { email: verification.newEmail } });
    if (existing && existing.id !== user.id) {
      await prisma.emailVerification.delete({ where: { token } });
      return res.status(409).json({ error: "Email already in use" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: verification.newEmail,
        pendingEmail: null,
        emailVerified: now,
      },
    });
    message = "Email updated";
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: now,
      },
    });
  }

  await prisma.emailVerification.delete({ where: { token } });

  return res.status(200).json({ message });
}
