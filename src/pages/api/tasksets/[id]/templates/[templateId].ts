import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, templateId } = req.query;
  const session = (await getServerSession(req, res, authOptions as any)) as any;

  const userRole = session?.user?.role;
  if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN")) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method === "DELETE") {
    try {
      await prisma.taskTemplate.delete({
        where: { id: Number(templateId) },
      });
      return res.status(200).json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting template:", error);
      return res.status(500).json({ error: "Error deleting template" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
