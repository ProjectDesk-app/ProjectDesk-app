import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { userId } = req.body as { userId?: number };
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  await sendEmail(
    user.email,
    "Reset your ProjectDesk password",
    `Hello ${user.name || "there"},\n\nAn administrator requested a password reset for your ProjectDesk account.\nPlease visit the password reset page to choose a new password.\n\nIf you did not request this change, contact support immediately.\n\nThanks,\nProjectDesk`
  );

  return res.status(200).json({ ok: true });
}
