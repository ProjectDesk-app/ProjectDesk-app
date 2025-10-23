import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = (req.method === "POST" ? req.body?.token : req.query.token) as string | undefined;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token is required" });
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
  });

  if (!verification) {
    return res.status(404).json({ error: "Token not found" });
  }

  if (verification.expiresAt < new Date()) {
    await prisma.emailVerification.delete({ where: { token } });
    return res.status(410).json({ error: "Token has expired" });
  }

  const user = await prisma.user.findUnique({ where: { id: verification.userId } });
  if (!user) {
    await prisma.emailVerification.delete({ where: { token } });
    return res.status(404).json({ error: "User not found" });
  }

  const now = new Date();
  let message = "Email verified";

  if (verification.newEmail) {
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
