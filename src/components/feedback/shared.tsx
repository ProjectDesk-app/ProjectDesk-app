export const STAGES = [
  { value: 'RECEIVED', label: 'Received & Queued' },
  { value: 'INITIAL_READING', label: 'Initial Reading' },
  { value: 'FULL_REVIEW', label: 'Under Full Review' },
  { value: 'FINALISING', label: 'Finalising Comments' },
  { value: 'COMPLETED', label: 'Review Completed' },
];
export type Review = {
  id: number; workId: number; title: string; recipientName: string; recipientEmail: string;
  workType: string; version: number; status: string; receivedDate: string; estimateStart: string;
  estimateEnd: string; completedAt: string | null; supervisorName: string; isOwner: boolean;
  trackingToken?: string; receiptEmailSentAt?: string | null; completionEmailSentAt?: string | null; calendarWarning?: string; cancellationReason?: string; overdue: boolean; canRequestUpdate: boolean;
  queuePosition: number | null; queueTotal: number; queueAhead: number | null;
  nextRequestDate?: string; turnaroundWorkingDays?: number; history: {id: number;type: string;message: string;createdAt: string}[];
};
export type Preset = {id: string | number;name: string;minDays: number | null;maxDays: number | null};
export const inputClass = 'min-w-0 max-w-full w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
export const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50';
export const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';
export function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {day: 'numeric',month: 'short',year: 'numeric',timeZone: 'Europe/London'}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}
export function today() {return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London',year: 'numeric',month: '2-digit',day: '2-digit'}).format(new Date());}
export function stageLabel(status: string) {return STAGES.find(s => s.value === status)?.label || (status === 'CANCELLED' ? 'Cancelled' : status);}
export function StatusBadge({status, overdue}: {status: string;overdue?: boolean}) {
  const colors = status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : status === 'CANCELLED' ? 'bg-gray-100 text-gray-700 ring-gray-200' : overdue ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-blue-50 text-blue-800 ring-blue-200';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${colors}`}>{stageLabel(status)}{overdue && !['COMPLETED','CANCELLED'].includes(status) ? ' · Overdue' : ''}</span>;
}
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {method,headers: body ? {'Content-Type': 'application/json'} : undefined,body: body ? JSON.stringify(body) : undefined});
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}

export function QueueSummary({position,total,ahead}: {position: number | null;total: number;ahead: number | null}) {
  if (position == null || !total) return null;
  const count = ahead ?? position - 1;
  return <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Place in queue</p>
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="text-2xl font-semibold text-gray-900">{position} <span className="text-base font-normal text-gray-500">of {total}</span></p>
      <p className="text-sm font-medium text-blue-800">{count === 0 ? 'Next in queue' : `${count} review${count === 1 ? '' : 's'} ahead`}</p>
    </div>
  </div>;
}
