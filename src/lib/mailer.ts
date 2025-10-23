export async function sendEmail(to: string, subject: string, message: string) {
  console.log(`\n📧 [Mock Email]\nTo: ${to}\nSubject: ${subject}\n${message}\n`);
}
