import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;

  if (req.method === "PATCH") {
    try {
      const notification = await prisma.notification.update({
        where: { id: Number(id) },
        data: { read: true },
      });
      return res.status(200).json(notification);
    } catch (error) {
      console.error("Error updating notification:", error);
      return res.status(500).json({ error: "Failed to update notification" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}