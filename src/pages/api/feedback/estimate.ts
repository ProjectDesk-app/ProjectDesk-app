import type { NextApiRequest, NextApiResponse } from 'next';
import { feedbackUser, feedbackFailure, estimate, dayCount } from '@/lib/feedback';
import { calendarDate } from '@/lib/feedbackDates';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
    await feedbackUser(req, res, true);
    return res.json(await estimate(calendarDate(req.query.receivedDate), dayCount(Number(req.query.minDays)), dayCount(Number(req.query.maxDays))));
  } catch (error) { return feedbackFailure(res, error); }
}
