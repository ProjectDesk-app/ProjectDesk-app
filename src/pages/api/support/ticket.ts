import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { sendTemplatedEmail } from '@/lib/emailTemplates';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session?.user?.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { title, description } = req.body as { title?: string; description?: string };
  if (!title || !description) {
    return res.status(400).json({ error: "Title and description are required" });
  }

  const reference = createReference();
  const reporterName = session.user.name || session.user.email;
  const reporterEmail = session.user.email;

  try {
    await sendTemplatedEmail('support@projectdesk.app', 'support.ticket-admin', { reference, title, requesterName: reporterName || 'Unknown', requesterEmail: reporterEmail || '', description });

    await sendTemplatedEmail(reporterEmail, 'support.ticket-confirmation', { recipientName: reporterName || 'there', reference, title });
  } catch (error) {
    console.error("Failed to send support ticket emails", error);
    return res.status(500).json({ error: "Unable to send support ticket" });
  }

  return res.status(200).json({ ok: true, reference });
}

function createReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `T-${timestamp}${random}`;
}
