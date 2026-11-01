import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { sendTemplatedEmail } from '@/lib/emailTemplates';

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

  await sendTemplatedEmail(user.email, 'account.admin-reset', { recipientName: user.name || 'there', actionUrl: (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '') + '/forgot-password' });

  return res.status(200).json({ ok: true });
}
