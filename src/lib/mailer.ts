const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CAPTURE = /([^\s<]+@[^\s>]+)/;

function extractEmail(address?: string | null) {
  if (!address) return null;
  const match = address.match(EMAIL_CAPTURE);
  return match ? match[1] || match[0] : null;
}

function logMockEmail(to: string, subject: string, message: string) {
  console.log(`\n📧 [Mock Email]\nTo: ${to}\nSubject: ${subject}\n${message}\n`);
}

function buildHtmlTemplate(subject: string, message: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://portal.projectdesk.app";
  const logoUrl = `${base.replace(/\/$/, "")}/branding/ProjectDesk-Transparent.png`;
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

export async function sendEmail(to: string, subject: string, message: string) {
  const normalizedRecipient = extractEmail(to);
  if (!normalizedRecipient || !EMAIL_REGEX.test(normalizedRecipient)) {
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(errorText);
    }
  } catch (error) {
    console.error("[Email] Failed to send message via Mailgun:", error);
    logMockEmail(normalizedRecipient, subject, message);
    throw new Error("Email delivery failed");
  }
}
