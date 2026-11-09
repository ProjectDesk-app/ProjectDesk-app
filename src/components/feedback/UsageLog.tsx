import { useState } from 'react';
import useSWR from 'swr';
import { api, formatDate, secondaryClass } from './shared';

export default function UsageLog({ reviewId }: { reviewId?: number }) {
  const [open, setOpen] = useState(false);
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const params = new URLSearchParams();
  if (reviewId) params.set('reviewId', String(reviewId));
  if (cursor) params.set('cursor', String(cursor));
  const { data, error, mutate, isValidating } = useSWR(open ? `/api/feedback/views?${params}` : null, (url: string) => api<any>(url));
  return <section className="rounded-xl border border-gray-200 bg-white p-4">
    <button type="button" className="text-sm font-semibold text-blue-700" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} page usage</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs text-gray-600">Page opens since usage logging was enabled. Automatic refreshes and your signed-in visits are excluded. Hub views count once per displayed review per page visit. Anonymous views may include automated browsers and cannot identify a student or prove feedback was read.</p>
      {error ? <p role="alert" className="text-sm text-red-700">Unable to load usage. Please try refreshing.</p> : !data ? <p role="status">Loading usage…</p> : <>
        <p className="text-sm"><strong>{data.total}</strong> views · {data.identified} identified recipient views · {data.anonymous} anonymous views{!reviewId && ` · ${data.reviewsViewed} review versions viewed`}</p>
        <ol className="max-h-80 space-y-3 overflow-y-auto">{data.views.length ? data.views.map((view: any) => <li key={view.id} className="border-l-2 border-blue-100 pl-3 text-sm">
          <p>{view.kind === 'RECIPIENT' ? `${view.recipientName} viewed the page` : 'Somebody viewed the page'}</p>
          {!reviewId && <p className="break-words text-gray-600">{view.review.work.title} · V{view.review.version}</p>}
          <p className="text-xs text-gray-500">{formatDate(view.createdAt)} · {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London' }).format(new Date(view.createdAt))} (UK time) · {view.source === 'HUB' ? 'Signed-in Hub' : 'Tracking page'}</p>
        </li>) : <li className="text-sm text-gray-500">No views recorded yet.</li>}</ol>
        <div className="flex flex-wrap gap-2">{cursors.length > 1 && <button type="button" className={secondaryClass} onClick={() => setCursors(cursors.slice(0, -1))}>Newer</button>}{data.nextCursor && <button type="button" className={secondaryClass} onClick={() => setCursors([...cursors, data.nextCursor])}>Older</button>}</div>
      </>}
      <button type="button" className={secondaryClass} disabled={isValidating} onClick={() => mutate()}>Refresh usage</button>
    </div>}
  </section>;
}
