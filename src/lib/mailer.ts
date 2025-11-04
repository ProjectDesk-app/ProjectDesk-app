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
    const fromHeader =
      fromRaw && /<[^<>]*@[^<>]+>/.test(fromRaw) ? fromRaw : fromEmail!;

    const body = new URLSearchParams({
      from: fromHeader,
      to: normalizedRecipient,
      subject,
      text: message,
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
    console.log("from address:", { fromHeader });
    logMockEmail(normalizedRecipient, subject, message);
    throw new Error("Email delivery failed");
  }
}
