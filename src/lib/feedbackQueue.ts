import { prisma } from '@/lib/prisma';

export type FeedbackQueueInfo = {
  queuePosition: number;
  queueTotal: number;
  queueAhead: number;
};

type QueueRow = {
  id: number;
  receivedDate: string;
  createdAt: Date | string;
  queuePosition?: number | null;
  status?: string;
};

/** Ranked reviews retain manual order; new unranked arrivals follow in receipt order. */
export function orderFeedbackQueue<T extends QueueRow>(rows: T[]): T[] {
  return rows.filter(row => row.status !== 'COMPLETED' && row.status !== 'CANCELLED').sort((a, b) => {
    if (a.queuePosition != null || b.queuePosition != null) {
      if (a.queuePosition == null) return 1;
      if (b.queuePosition == null) return -1;
      if (a.queuePosition !== b.queuePosition) return a.queuePosition - b.queuePosition;
    }
    return a.receivedDate.localeCompare(b.receivedDate) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id;
  });
}

/** Fetch aggregate queue information, never other recipients' names or work details. */
export async function feedbackQueueMap(supervisorIds: number[], client = prisma): Promise<Map<number, FeedbackQueueInfo>> {
  const ids = Array.from(new Set(supervisorIds));
  const result = new Map<number, FeedbackQueueInfo>();
  if (!ids.length) return result;
  const rows = await client.feedbackReview.findMany({
    where: { work: { supervisorId: { in: ids } }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { id: true, receivedDate: true, createdAt: true, queuePosition: true, work: { select: { supervisorId: true } } },
  });
  const groups = new Map<number, typeof rows>();
  for (const row of rows) {
    const group = groups.get(row.work.supervisorId) || [];
    group.push(row);
    groups.set(row.work.supervisorId, group);
  }
  for (const group of Array.from(groups.values())) {
    const ordered = orderFeedbackQueue(group);
    ordered.forEach((row, index) => result.set(row.id, { queuePosition: index + 1, queueTotal: ordered.length, queueAhead: index }));
  }
  return result;
}
