import type { NextApiRequest, NextApiResponse } from "next";
import { sendEmail } from "@/lib/mailer";

type CaptchaPayload = {
  answer?: unknown;
  first?: unknown;
  second?: unknown;
};

type ContactRequestBody = {
  name?: unknown;
  email?: unknown;
  type?: unknown;
  description?: unknown;
  captcha?: CaptchaPayload;
};

const ALLOWED_TYPES = new Set([
  "Issue",
  "Bug report",
  "Billing query",
  "Custom pricing",
  "Partnership",
  "Other",
]);

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_DESCRIPTION_LENGTH = 2000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body =
    typeof req.body === "object" && req.body !== null ? (req.body as ContactRequestBody) : {};
  const { name, email, type, description, captcha } = body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: "Name must be 1-120 characters" });
  }

  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  if (
    !trimmedEmail ||
    trimmedEmail.length > MAX_EMAIL_LENGTH ||
    !isValidEmail(trimmedEmail)
  ) {
    return res.status(400).json({ error: "A valid email is required" });
  }

  const contactType = typeof type === "string" && type.trim() ? type.trim() : "Contact";
  if (contactType !== "Contact" && !ALLOWED_TYPES.has(contactType)) {
    return res.status(400).json({ error: "Contact type is invalid" });
  }

  const trimmedDescription = typeof description === "string" ? description.trim() : "";
  if (
    !trimmedDescription ||
    trimmedDescription.length > MAX_DESCRIPTION_LENGTH
  ) {
    return res.status(400).json({ error: "Description must be 1-2000 characters" });
  }

  if (!isCaptchaValid(captcha)) {
    return res.status(400).json({ error: "Captcha validation failed" });
  }

  const reference = createReference();
  const subject = `Contact request: ${contactType}`;
  const message = [
    `Reference: ${reference}`,
    `Name: ${trimmedName}`,
    `Email: ${trimmedEmail}`,
    `Type: ${contactType}`,
    "",
    trimmedDescription,
  ].join("\n");

  try {
    await sendEmail("support@projectdesk.app", subject, message);
  } catch (error) {
    console.error("Failed to send contact email", error);
    return res.status(500).json({ error: "Unable to send message" });
  }

  return res.status(200).json({ ok: true, reference, ticketId: reference });
}

function isCaptchaValid(captcha: CaptchaPayload | undefined): boolean {
  if (!captcha || typeof captcha !== "object") {
    return false;
  }

  const { answer, first, second } = captcha;
  if (
    typeof answer !== "number" ||
    typeof first !== "number" ||
    typeof second !== "number" ||
    !Number.isFinite(answer) ||
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return false;
  }

  const expected = first + second;
  return answer === expected;
}

function isValidEmail(value: string): boolean {
  // Basic RFC 5322 compliant pattern that avoids backtracking pitfalls.
  const emailPattern =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailPattern.test(value);
}

function createReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `C-${timestamp}${random}`;
}
