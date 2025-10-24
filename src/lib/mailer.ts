import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.SES_REGION!,
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

export async function sendEmail(to: string, subject: string, message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n📧 [Mock Email]\nTo: ${to}\nSubject: ${subject}\n${message}\n`);
    return;
  }

  const from = process.env.SES_FROM_ADDRESS!;
  await ses.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [to] },
      Message: {
        Body: { Text: { Data: message } },
        Subject: { Data: subject },
      },
      Source: from,
    })
  );
}