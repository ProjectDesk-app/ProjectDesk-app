import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(["SENT", "FAILED", "MOCK"]);

function parsePositiveInt(value: string | string[] | undefined, fallback: number) {
  if (!value || Array.isArray(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 25), 100);
  const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
  const status = ALLOWED_STATUSES.has(statusRaw) ? statusRaw : "";

  const where: any = {};
  if (status) {
    where.status = status;
  }
  if (qRaw) {
    where.OR = [
      { to: { contains: qRaw, mode: "insensitive" } },
      { subject: { contains: qRaw, mode: "insensitive" } },
      { messagePreview: { contains: qRaw, mode: "insensitive" } },
      { error: { contains: qRaw, mode: "insensitive" } },
    ];
  }

  try {
    const [total, items] = await prisma.$transaction([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          to: true,
          subject: true,
          messagePreview: true,
          status: true,
          provider: true,
          providerMessageId: true,
          error: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return res.status(200).json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      filters: {
        q: qRaw,
        status,
      },
    });
  } catch (error: any) {
    const code = error?.code || error?.meta?.code;
    if (code === "P2021") {
      return res.status(500).json({
        error: "Email logs table is missing. Run Prisma migrations before using this endpoint.",
      });
    }
    console.error("Failed to fetch email logs", error);
    return res.status(500).json({ error: "Failed to fetch email logs" });
  }
}
