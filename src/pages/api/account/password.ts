import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  const userId = Number(session?.user?.id);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: "Password cannot be updated" });
  }

  if (!currentPassword) {
    return res.status(400).json({ error: "Current password is required" });
  }

  const isValid = await compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return res.status(403).json({ error: "Current password is incorrect" });
  }

  const hashed = await hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashed },
  });

  return res.status(200).json({ message: "Password updated" });
}
