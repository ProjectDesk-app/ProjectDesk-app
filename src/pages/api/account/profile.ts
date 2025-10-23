import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  const userId = Number(session?.user?.id);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        pendingEmail: true,
        emailVerified: true,
        role: true,
      },
    });
    return res.status(200).json(user);
  }

  if (req.method === "PUT") {
    const { name } = req.body as { name?: string };
    const trimmed = name?.trim();
    if (!trimmed) {
      return res.status(400).json({ error: "Name is required" });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name: trimmed },
      select: { id: true, name: true },
    });

    return res.status(200).json(updated);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
