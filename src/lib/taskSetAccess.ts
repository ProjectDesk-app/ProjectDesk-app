import { prisma } from "./prisma";

export async function findManagedTaskSet(id: number, user: { id: number | string; role: string }) {
  return prisma.taskSet.findFirst({
    where: { id, ...(user.role === "ADMIN" ? {} : { supervisorId: Number(user.id) }) },
    include: { templates: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
  });
}

export function positiveId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
