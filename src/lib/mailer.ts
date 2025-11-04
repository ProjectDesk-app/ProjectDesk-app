import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let cachedClient: SESClient | null = null;

function getSesClient() {
  if (!cachedClient) {
    const region = process.env.SES_REGION;
    const accessKeyId = process.env.SES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error("AWS SES credentials are not fully configured");
    }

    cachedClient = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  return cachedClient;
}

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

  const fromRaw = process.env.SES_FROM_ADDRESS;
  const fromAddress = extractEmail(fromRaw);

  const missingConfig =
    !fromAddress ||
    !process.env.SES_REGION ||
    !process.env.SES_ACCESS_KEY_ID ||
    !process.env.SES_SECRET_ACCESS_KEY;

  const forceSend = process.env.SES_FORCE_SEND === "true";
  const shouldUseMock = missingConfig || (process.env.NODE_ENV !== "production" && !forceSend);

  if (shouldUseMock) {
    if (missingConfig && process.env.NODE_ENV === "production") {
      console.warn(
        "[Email] AWS SES configuration incomplete. Falling back to mock email delivery."
      );
    }
    logMockEmail(normalizedRecipient, subject, message);
    return;
  }

  const client = getSesClient();
  try {
    const command = new SendEmailCommand({
      Destination: { ToAddresses: [normalizedRecipient] },
      Message: {
        Body: { Text: { Data: message, Charset: "UTF-8" } },
        Subject: { Data: subject, Charset: "UTF-8" },
      },
      Source: fromAddress,
      ReplyToAddresses: [fromAddress],
    });

    await client.send(command);
  } catch (error) {
    console.error("[Email] Failed to send message via SES:", error);
    logMockEmail(normalizedRecipient, subject, message);
    throw new Error("Email delivery failed");
  }
}
