import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import type { UserRole } from "@prisma/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "GET") {
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });
    return res.status(200).json(users);
  }

  if (req.method === "PUT") {
    const { userId, role, name, email } = req.body as {
      userId?: number;
      role?: string;
      name?: string | null;
      email?: string;
    };
    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    const data: any = {};
    if (role) {
      const allowedRoles: UserRole[] = ["ADMIN", "SUPERVISOR", "STUDENT", "COLLABORATOR"];
      if (!allowedRoles.includes(role as UserRole)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      data.role = role as UserRole;
    }
    if (name !== undefined) {
      data.name = name ? name.trim() : null;
    }
    if (email) {
      data.email = email.trim().toLowerCase();
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    await prisma.user.update({ where: { id: Number(userId) }, data });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).json({ error: "Method not allowed" });
}
