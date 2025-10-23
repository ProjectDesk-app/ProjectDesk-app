import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const session = (await getServerSession(req, res, authOptions as any)) as any;

  if (!session) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: Number(id) },
      include: {
        supervisor: true,
        students: true,
        collaborators: true,
      },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Combine all users into one flat list
    const users = [
      ...(project.supervisor ? [project.supervisor] : []),
      ...project.students,
      ...project.collaborators,
    ].map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
    }));

    return res.status(200).json(users);
  } catch (error) {
    console.error("Error loading users:", error);
    return res.status(500).json({ message: "Error loading users" });
  }
}