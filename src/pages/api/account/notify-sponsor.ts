import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { sendTemplatedEmail } from '@/lib/emailTemplates';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  const userId = Number(session?.user?.id);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      sponsorSubscriptionInactive: true,
      sponsor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!user || !user.sponsor) {
    return res.status(400).json({ error: "No sponsor found for this account" });
  }

  if (!user.sponsorSubscriptionInactive) {
    return res.status(400).json({ error: "Sponsor subscription is already active" });
  }

  try {
    const sponsorName = user.sponsor.name || "there";
    const studentName = user.name || user.email;

    await sendTemplatedEmail(user.sponsor.email, 'sponsorship.action-needed', { recipientName: sponsorName, studentName, studentEmail: user.email, actionUrl: (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '') + '/supervisor' });
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("Failed to notify sponsor", error);
    return res.status(500).json({ error: "Unable to send notification email" });
  }
}
