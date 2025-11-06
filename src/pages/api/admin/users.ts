import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import type { UserRole } from "@prisma/client";
import { SubscriptionType } from "@prisma/client";
import { cancelSubscription, cancelMandate } from "@/lib/gocardless";

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

  if (req.method === "DELETE") {
    const { userId } = req.body as { userId?: number };
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({ error: "userId required" });
    }

    const id = Number(userId);

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        goCardlessSubscriptionId: true,
        goCardlessMandateId: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (id === session.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const [supervisedProjects, ownedTaskSets, sponsoredUsers] = await prisma.$transaction([
      prisma.project.count({ where: { supervisorId: id } }),
      prisma.taskSet.count({ where: { supervisorId: id } }),
      prisma.user.count({ where: { sponsorId: id } }),
    ]);

    if (supervisedProjects > 0) {
      return res.status(400).json({
        error: "This user supervises active projects. Reassign or archive those projects before deleting the account.",
      });
    }

    if (ownedTaskSets > 0) {
      return res.status(400).json({
        error: "This user owns task sets. Reassign or delete those task sets before deleting the account.",
      });
    }

    if (sponsoredUsers > 0) {
      return res.status(400).json({
        error: "This user sponsors other accounts. Remove their sponsorships before deleting the account.",
      });
    }

    if (targetUser.goCardlessSubscriptionId) {
      try {
        await cancelSubscription(targetUser.goCardlessSubscriptionId);
      } catch (error: any) {
        console.error("GoCardless cancel before delete failed", error);
      }
    }

    if (targetUser.goCardlessMandateId) {
      try {
        await cancelMandate(targetUser.goCardlessMandateId);
      } catch (error: any) {
        console.error("GoCardless cancel mandate before delete failed", error);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.comment.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({
        where: {
          OR: [{ actorId: id }, { recipientId: id }],
        },
      });
      await tx.projectMember.deleteMany({ where: { userId: id } });
      await tx.task.updateMany({
        where: { assigneeId: id },
        data: {
          assigneeId: null,
        },
      });
      await tx.task.updateMany({
        where: { flaggedByUserId: id },
        data: {
          flaggedByUserId: null,
          flagged: false,
        },
      });
      await tx.user.updateMany({
        where: { supervisorId: id },
        data: { supervisorId: null },
      });
      await tx.user.updateMany({
        where: { sponsorId: id },
        data: {
          sponsorId: null,
          subscriptionType: SubscriptionType.FREE_TRIAL,
        },
      });

      const tasksWithUser = await tx.task.findMany({
        where: { assignedUsers: { some: { id } } },
        select: { id: true },
      });
      for (const task of tasksWithUser) {
        await tx.task.update({
          where: { id: task.id },
          data: { assignedUsers: { disconnect: { id } } },
        });
      }

      const collaboratorProjects = await tx.project.findMany({
        where: { collaborators: { some: { id } } },
        select: { id: true },
      });
      for (const project of collaboratorProjects) {
        await tx.project.update({
          where: { id: project.id },
          data: { collaborators: { disconnect: { id } } },
        });
      }

      const studentProjects = await tx.project.findMany({
        where: { students: { some: { id } } },
        select: { id: true },
      });
      for (const project of studentProjects) {
        await tx.project.update({
          where: { id: project.id },
          data: { students: { disconnect: { id } } },
        });
      }

      await tx.user.delete({ where: { id } });
    });

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}
