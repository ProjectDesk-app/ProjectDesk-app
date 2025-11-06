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

const DEFAULT_ALLOWED_ORIGINS = [
  "https://projectdesk.app",
  "https://www.projectdesk.app",
];

const ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      process.env.MARKETING_SITE_URL,
      process.env.NEXT_PUBLIC_MARKETING_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXTAUTH_URL,
      ...DEFAULT_ALLOWED_ORIGINS,
    ].filter((value): value is string => typeof value === "string" && value.length > 0)
  )
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestOrigin = req.headers.origin;
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST", "OPTIONS"]);
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
    const confirmationSubject = `We received your request (${reference})`;
    const confirmationBody = [
      `Hello ${trimmedName},`,
      "",
      "Thanks for contacting ProjectDesk support. We've received your request and will get back to you soon.",
      "",
      `Reference: ${reference}`,
      `Topic: ${contactType}`,
      "",
      "Please do not reply to this email - this address is used for notifications only and is not monitored.",
      "",
      "Thanks,",
      "The ProjectDesk Team",
    ].join("\n");

    await sendEmail(trimmedEmail, confirmationSubject, confirmationBody);
  } catch (error) {
    console.error("Failed to send contact emails", error);
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
