import { prisma } from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CAPTURE = /([^\s<]+@[^\s>]+)/;
const MAX_PREVIEW_LENGTH = 1200;
const MAX_ERROR_LENGTH = 2000;

function extractEmail(address?: string | null) {
  if (!address) return null;
  const match = address.match(EMAIL_CAPTURE);
  return match ? match[1] || match[0] : null;
}

function logMockEmail(to: string, subject: string, message: string) {
  console.log(`\n📧 [Mock Email]\nTo: ${to}\nSubject: ${subject}\n${message}\n`);
}

function buildHtmlTemplate(subject: string, message: string) {
  const fallbackLogoUrl =
    "https://raw.githubusercontent.com/ProjectDesk-app/ProjectDesk-app/refs/heads/main/src/assets/branding/ProjectDesk-Transparent.png";
  const envLogoUrl = (process.env.EMAIL_LOGO_URL || "").trim();
  const logoUrl = envLogoUrl || fallbackLogoUrl;
  const safeMessage = message
    .split("\n")
    .map((line) => line.trim())
    .join("<br />");

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${subject}</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        background-color: #f5f5f5;
        color: #111827;
      }
      .wrapper {
        padding: 24px 12px;
      }
      .card {
        max-width: 560px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 12px;
        padding: 32px;
        box-shadow: 0 5px 25px rgba(15, 23, 42, 0.08);
      }
      .logo {
        text-align: center;
        margin-bottom: 24px;
      }
      .logo img {
        height: 48px;
        width: auto;
      }
      .content {
        font-size: 15px;
        line-height: 1.6;
      }
      .footer {
        margin-top: 32px;
        font-size: 12px;
        color: #6b7280;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="logo">
          <img src="${logoUrl}" alt="ProjectDesk" />
        </div>
        <div class="content">
          ${safeMessage}
        </div>
        <div class="footer">
          Sent by ProjectDesk • Please contact support if you have questions.
        </div>
      </div>
    </div>
  </body>
</html>
`;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function buildPreview(message: string) {
  const normalized = message
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  return truncate(normalized, MAX_PREVIEW_LENGTH);
}

function extractMailgunMessageId(responseBody: string) {
  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody) as { id?: unknown };
    if (typeof parsed.id === "string" && parsed.id.trim()) {
      return parsed.id.trim();
    }
  } catch {
    return null;
  }
  return null;
}

async function persistEmailLog(input: {
  to: string;
  subject: string;
  message: string;
  status: "SENT" | "FAILED" | "MOCK";
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
}) {
  try {
    await prisma.emailLog.create({
      data: {
        to: input.to,
        subject: truncate(input.subject, 300),
        messagePreview: buildPreview(input.message),
        status: input.status,
        provider: input.provider ?? null,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error ? truncate(input.error, MAX_ERROR_LENGTH) : null,
      },
    });
  } catch (error) {
    // Logging should never block delivery attempts.
    console.error("[Email] Failed to persist email log:", error);
  }
}

export async function sendEmail(to: string, subject: string, message: string) {
  const normalizedRecipient = extractEmail(to);
  if (!normalizedRecipient || !EMAIL_REGEX.test(normalizedRecipient)) {
    await persistEmailLog({
      to: to || "(empty)",
      subject: subject || "(empty)",
      message: message || "",
      status: "FAILED",
      error: `Invalid recipient email address: ${to}`,
    });
    throw new Error(`Invalid recipient email address: ${to}`);
  }

  const fromRaw = (process.env.MAILGUN_FROM_ADDRESS || "").trim();
  const fromEmail = extractEmail(fromRaw);
  const domain = process.env.MAILGUN_DOMAIN;

  const apiKey = process.env.MAILGUN_API_KEY;
  const apiBaseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";

  const missingConfig = !fromEmail || !domain || !apiKey;

  const forceSend = process.env.MAILGUN_FORCE_SEND === "true";
  const shouldUseMock = missingConfig || (process.env.NODE_ENV !== "production" && !forceSend);

  if (shouldUseMock) {
    if (missingConfig && process.env.NODE_ENV === "production") {
      console.warn(
        "[Email] Mailgun configuration incomplete. Falling back to mock email delivery."
      );
    }
    logMockEmail(normalizedRecipient, subject, message);
    await persistEmailLog({
      to: normalizedRecipient,
      subject,
      message,
      status: "MOCK",
      provider: "mock",
      error: missingConfig ? "Mailgun config missing; message not sent to provider." : null,
    });
    return;
  }

  try {
    const html = buildHtmlTemplate(subject, message);

    const body = new URLSearchParams({
      from: fromRaw,
      to: normalizedRecipient,
      subject,
      text: message,
      html,
    });

    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(responseBody || "Unknown provider error");
    }

    await persistEmailLog({
      to: normalizedRecipient,
      subject,
      message,
      status: "SENT",
      provider: "mailgun",
      providerMessageId: extractMailgunMessageId(responseBody),
    });
  } catch (error) {
    console.error("[Email] Failed to send message via Mailgun:", error);
    await persistEmailLog({
      to: normalizedRecipient,
      subject,
      message,
      status: "FAILED",
      provider: "mailgun",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    logMockEmail(normalizedRecipient, subject, message);
    throw new Error("Email delivery failed");
  }
}
