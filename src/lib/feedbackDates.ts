export class FeedbackDateError extends Error {}
// Calendar dates are stored as ISO strings so UK date boundaries survive DST.
export function ukToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new FeedbackDateError('Enter a valid date (YYYY-MM-DD).');
  return value;
}
export function shiftDay(day: string, amount: number) { const date = new Date(calendarDate(day)); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
export function isWorkingDay(day: string, holidays: Set<string>) { const week = new Date(calendarDate(day)).getUTCDay(); return week !== 0 && week !== 6 && !holidays.has(day); }
export function addWorkingDays(day: string, days: number, holidays: Set<string>) {
  if (!Number.isInteger(days) || days < 0 || days > 730) throw new FeedbackDateError('Working-day estimates must be whole numbers between 0 and 730.');
  let result = calendarDate(day);
  for (let remaining = days; remaining > 0;) { result = shiftDay(result, 1); if (isWorkingDay(result, holidays)) remaining--; }
  return result;
}
export function workingDaysBetween(from: string, to: string, holidays: Set<string>) { let count = 0; for (let day = shiftDay(from, 1); day <= to; day = shiftDay(day, 1)) { if (isWorkingDay(day, holidays)) count++; } return count; }
export function validateRange(start: string, end: string, received: string) { calendarDate(start); calendarDate(end); if (start < received || end < start) throw new FeedbackDateError('The estimate must start on or after receipt and end on or after its start.'); }

/** Friendly British date ranges for correspondence; stored calendar dates stay unchanged. */
export function formatFeedbackDateRange(start: string, end: string): string {
  const parts = (value: string) => {
    const date = new Date(`${calendarDate(value)}T12:00:00Z`);
    const day = date.getUTCDate();
    const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
    return { day: `${day}${suffix}`, month: new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(date), year: date.getUTCFullYear() };
  };
  const first = parts(start), last = parts(end);
  if (start === end) return `${first.day} ${first.month} ${first.year}`;
  if (first.year !== last.year) return `${first.day} ${first.month} ${first.year} – ${last.day} ${last.month} ${last.year}`;
  if (first.month !== last.month) return `${first.day} ${first.month} – ${last.day} ${last.month} ${last.year}`;
  return `${first.day} – ${last.day} ${last.month} ${last.year}`;
}
