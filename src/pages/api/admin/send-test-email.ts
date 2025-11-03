import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { sendEmail } from "@/lib/mailer";

type AdminSession = Session & {
  user?: Session["user"] & { role?: string };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as AdminSession | null;
  if (!session?.user || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, message } = req.body as {
    to?: string;
    subject?: string;
    message?: string;
  };

  if (!to || !subject || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const trimmedTo = to.trim();
  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedTo)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  try {
    await sendEmail(trimmedTo, trimmedSubject, trimmedMessage);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("Failed to send test email", error);
    return res.status(500).json({
      error: "Failed to send email",
      details: error?.message ?? "Unknown error",
    });
  }
}
