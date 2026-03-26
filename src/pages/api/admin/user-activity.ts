import type { NextApiRequest, NextApiResponse } from "next";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]";

const RECENT_LIMIT = 12;

const truncate = (value: string, maxLength = 120) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  createdAt: string;
  href: string | null;
};

const toActivityItem = (
  id: string,
  kind: string,
  title: string,
  createdAt: Date,
  detail: string | null = null,
  href: string | null = null
): ActivityItem => ({
  id,
  kind,
  title,
  detail,
  createdAt: createdAt.toISOString(),
  href,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const userId = Number(req.query.userId);
  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ error: "A valid userId is required" });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const pendingRequestWhere = {
    supervisorId: userId,
    sponsorId: null,
    role: { in: [UserRole.STUDENT, UserRole.COLLABORATOR] },
  };

  const [
    projectsCreatedCount,
    sponsoredAccountsCount,
    pendingRequestsCount,
    taskSetsCreatedCount,
    projectUpdatesCount,
    filesUploadedCount,
    commentsCount,
    latestProjects,
    latestSponsoredUsers,
    latestPendingRequests,
    latestTaskSets,
    latestProjectUpdates,
    latestProjectFiles,
    latestComments,
  ] = await Promise.all([
    prisma.project.count({ where: { supervisorId: userId } }),
    prisma.user.count({ where: { sponsorId: userId } }),
    prisma.user.count({ where: pendingRequestWhere }),
    prisma.taskSet.count({ where: { supervisorId: userId } }),
    prisma.projectUpdate.count({ where: { userId } }),
    prisma.projectFile.count({ where: { userId } }),
    prisma.comment.count({ where: { userId } }),
    prisma.project.findMany({
      where: { supervisorId: userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: { sponsorId: userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: pendingRequestWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.taskSet.findMany({
      where: { supervisorId: userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    }),
    prisma.projectUpdate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.projectFile.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.comment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        content: true,
        createdAt: true,
        task: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const recentActivity = [
    toActivityItem(
      `account-${targetUser.id}`,
      "ACCOUNT_CREATED",
      "Created their ProjectDesk account",
      targetUser.createdAt,
      `${targetUser.role} account`,
      null
    ),
    ...latestProjects.map((project) =>
      toActivityItem(
        `project-${project.id}`,
        "PROJECT_CREATED",
        `Created project "${project.title}"`,
        project.createdAt,
        null,
        `/projects/${project.id}`
      )
    ),
    ...latestSponsoredUsers.map((user) =>
      toActivityItem(
        `sponsored-${user.id}`,
        "SPONSORED_ACCOUNT_JOINED",
        `Sponsored account joined: ${user.name || user.email}`,
        user.createdAt,
        `${user.role} • ${user.email}`,
        null
      )
    ),
    ...latestPendingRequests.map((user) =>
      toActivityItem(
        `request-${user.id}`,
        "SPONSORSHIP_REQUEST",
        `Received sponsorship request from ${user.name || user.email}`,
        user.createdAt,
        `${user.role} • ${user.email}`,
        null
      )
    ),
    ...latestTaskSets.map((taskSet) =>
      toActivityItem(
        `taskset-${taskSet.id}`,
        "TASK_SET_CREATED",
        `Created task set "${taskSet.name}"`,
        taskSet.createdAt
      )
    ),
    ...latestProjectUpdates.map((update) =>
      toActivityItem(
        `update-${update.id}`,
        "PROJECT_UPDATE",
        `Posted update "${update.title}"`,
        update.createdAt,
        update.project.title,
        `/projects/${update.project.id}`
      )
    ),
    ...latestProjectFiles.map((file) =>
      toActivityItem(
        `file-${file.id}`,
        "PROJECT_FILE",
        `Added ${file.type === "FOLDER" ? "folder" : "file"} "${file.name}"`,
        file.createdAt,
        file.project.title,
        `/projects/${file.project.id}/files`
      )
    ),
    ...latestComments.map((comment) =>
      toActivityItem(
        `comment-${comment.id}`,
        "COMMENT_POSTED",
        `Commented on "${comment.task.title}"`,
        comment.createdAt,
        `${comment.task.project.title} • ${truncate(comment.content)}`,
        `/tasks/${comment.task.id}`
      )
    ),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 25);

  return res.status(200).json({
    user: {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      createdAt: targetUser.createdAt.toISOString(),
    },
    summary: {
      accountCreatedAt: targetUser.createdAt.toISOString(),
      projectsCreatedCount,
      sponsoredAccountsCount,
      pendingRequestsCount,
      taskSetsCreatedCount,
      projectUpdatesCount,
      filesUploadedCount,
      commentsCount,
    },
    sponsoredUsers: latestSponsoredUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    })),
    pendingRequests: latestPendingRequests.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    })),
    recentActivity,
  });
}
