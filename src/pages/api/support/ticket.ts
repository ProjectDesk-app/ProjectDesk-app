import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { sendEmail } from "@/lib/mailer";

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

  const body = [
    `Reporter: ${session.user.name || session.user.email}`,
    `Email: ${session.user.email}`,
    "",
    description,
  ].join("\n");

  await sendEmail("support@projectdesk.app", `Support ticket: ${title}`, body);

  return res.status(200).json({ ok: true });
}
