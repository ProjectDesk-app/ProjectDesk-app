export class FeedbackHolidayError extends Error {}
let cached: { holidays: Set<string>; first: string; last: string; expires: number } | undefined;
// Fetch the authoritative England and Wales calendar. Refuse calculations outside
// its coverage instead of silently counting unknown bank holidays as working days.
export async function feedbackHolidays(from: string, to = from): Promise<Set<string>> {
  if (!cached || cached.expires < Date.now()) {
    try {
      const response = await fetch('https://www.gov.uk/bank-holidays.json', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new FeedbackHolidayError('Holiday service unavailable');
      const data = await response.json();
      const events = data?.['england-and-wales']?.events;
      if (!Array.isArray(events) || !events.length || events.some((e: any) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date))) throw new FeedbackHolidayError('Invalid holiday calendar');
      const dates = events.map((e: any) => e.date as string).sort();
      cached = { holidays: new Set(dates), first: dates[0].slice(0, 4) + '-01-01', last: dates[dates.length - 1].slice(0, 4) + '-12-31', expires: Date.now() + 86400000 };
    } catch (error) { if (!cached) throw new FeedbackHolidayError('Bank-holiday dates are unavailable. Please try again shortly.'); }
  }
  if (from < cached.first || to > cached.last) throw new FeedbackHolidayError('These dates are outside the available bank-holiday calendar.');
  return cached.holidays;
}
