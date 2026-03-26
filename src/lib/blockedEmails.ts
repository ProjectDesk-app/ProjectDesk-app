import { prisma } from "@/lib/prisma";

export const normalizeEmail = (value?: string | null) =>
  value?.trim().toLowerCase() || "";

export async function findBlockedEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return prisma.blockedEmail.findUnique({
    where: { email: normalizedEmail },
  });
}

export async function isEmailBlocked(email?: string | null) {
  const blocked = await findBlockedEmail(email);
  return Boolean(blocked);
}
