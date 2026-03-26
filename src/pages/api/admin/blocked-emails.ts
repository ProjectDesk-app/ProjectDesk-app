import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]";
import { normalizeEmail } from "@/lib/blockedEmails";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "GET") {
    const blockedEmails = await prisma.blockedEmail.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        reason: true,
        createdAt: true,
        blockedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.status(200).json(blockedEmails);
  }

  if (req.method === "DELETE") {
    const { blockedEmailId, email } = req.body as { blockedEmailId?: number; email?: string };
    const normalizedEmail = normalizeEmail(email);

    if (!blockedEmailId && !normalizedEmail) {
      return res.status(400).json({ error: "blockedEmailId or email is required" });
    }

    const existing = blockedEmailId
      ? await prisma.blockedEmail.findUnique({ where: { id: Number(blockedEmailId) } })
      : await prisma.blockedEmail.findUnique({ where: { email: normalizedEmail } });

    if (!existing) {
      return res.status(404).json({ error: "Blocked email not found" });
    }

    await prisma.blockedEmail.delete({ where: { id: existing.id } });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}
