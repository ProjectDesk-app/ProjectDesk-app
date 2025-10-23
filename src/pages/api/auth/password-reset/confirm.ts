import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token is required" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken) {
    return res.status(404).json({ error: "Invalid or expired token" });
  }
  if (resetToken.expiresAt < new Date()) {
    await prisma.passwordResetToken.delete({ where: { token } });
    return res.status(410).json({ error: "Token has expired" });
  }

  const hashed = await hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashed },
    }),
    prisma.passwordResetToken.delete({ where: { token } }),
  ]);

  return res.status(200).json({ message: "Password updated" });
}
