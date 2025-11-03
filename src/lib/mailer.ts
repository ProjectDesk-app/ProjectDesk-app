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

export async function sendEmail(to: string, subject: string, message: string) {
  const from = process.env.SES_FROM_ADDRESS;
  if (!from) {
    throw new Error("SES_FROM_ADDRESS environment variable is missing");
  }

  if (process.env.NODE_ENV !== "production" && process.env.SES_FORCE_SEND !== "true") {
    console.log(`\n📧 [Mock Email]\nTo: ${to}\nSubject: ${subject}\n${message}\n`);
    return;
  }

  const client = getSesClient();
  const command = new SendEmailCommand({
    Destination: { ToAddresses: [to] },
    Message: {
      Body: { Text: { Data: message } },
      Subject: { Data: subject },
    },
    Source: from,
  });

  await client.send(command);
}
