import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;

  const userRole = session?.user?.role;
  if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN")) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { id } = req.query;

  try {
    if (req.method === "PUT") {
      // Rename Task Set
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });

      const updated = await prisma.taskSet.update({
        where: { id: Number(id) },
        data: { name },
      });

      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      // Delete Task Set
      await prisma.taskSet.delete({
        where: { id: Number(id) },
      });
      return res.status(204).end();
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Error in /api/tasksets/[id]:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
