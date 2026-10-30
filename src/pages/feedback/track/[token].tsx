import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { Check, ClipboardCheck } from 'lucide-react';
import Layout from '@/components/Layout';
import { api, formatDate, STAGES, StatusBadge, QueueSummary, today, buttonClass, secondaryClass } from '@/components/feedback/shared';

export default function FeedbackTracker() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const {data,error,isLoading,mutate} = useSWR(token ? `/api/feedback/track/${encodeURIComponent(token)}` : null, (url: string) => api<any>(url), {refreshInterval: 60000});
  const review = data?.review;
  const current = STAGES.findIndex(s => s.value === review?.status);
  const overdue = review && !['COMPLETED','CANCELLED'].includes(review.status) && review.estimateEnd < today();
  return <Layout title="Track feedback" compactGuestHeader><Head><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="no-referrer" /></Head>
    <div className="mx-auto min-w-0 max-w-2xl space-y-4 sm:space-y-6 sm:py-4">
      <div><div className="flex items-center gap-2.5 sm:justify-center"><ClipboardCheck className="h-5 w-5 shrink-0 text-blue-600 sm:h-7 sm:w-7" /><h1 className="text-lg font-semibold text-gray-900 sm:text-2xl">Track your feedback</h1></div><p className="mt-2 hidden text-center text-sm text-gray-600 sm:block">Return to this page anytime to check the status of your feedback.</p></div>
      {error ? <div role="alert" className="rounded-xl border bg-white p-6"><h2 className="font-semibold">Unable to open this review</h2><p className="mt-2 text-sm text-gray-600">{error.message}</p><button className={`${secondaryClass} mt-4`} onClick={() => mutate()}>Try again</button></div> : isLoading || !review ? <p role="status" className="py-12 text-center text-gray-500">Loading feedback progress…</p> : <>
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Version {review.version}</p><h2 className="mt-1 break-words text-lg font-semibold leading-snug text-gray-900 sm:text-xl">{review.title}</h2><p className="mt-1 break-words text-xs text-gray-600 sm:text-sm">Reviewed by {review.supervisorName}</p><div className="mt-2"><StatusBadge status={review.status} overdue={overdue} /></div></div>
          <div className="mt-4 rounded-xl bg-gray-50 p-3 sm:p-4">
            <dl><dt className="text-xs font-medium text-gray-500">Estimated feedback return</dt><dd className="mt-1 text-sm font-semibold text-gray-900">{review.estimateStart.slice(0,4) === review.estimateEnd.slice(0,4) ? new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',timeZone:'Europe/London'}).format(new Date(`${review.estimateStart}T12:00:00Z`)) : formatDate(review.estimateStart)} – {formatDate(review.estimateEnd)}</dd></dl>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-3 border-t border-gray-200 pt-3">
              <dl><dt className="text-xs font-medium text-gray-500">Received</dt><dd className="mt-1 text-sm font-medium">{formatDate(review.receivedDate)}</dd></dl>
              {!['COMPLETED','CANCELLED'].includes(review.status) && <QueueSummary compact position={review.queuePosition} total={review.queueTotal} ahead={review.queueAhead} />}
              {review.completedAt && <dl><dt className="text-xs font-medium text-gray-500">Feedback returned</dt><dd className="mt-1 text-sm font-medium">{formatDate(review.completedAt)}</dd></dl>}
            </div>
          </div>
          {overdue && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The estimated return date has passed. Sign in with the email address used for this review to request an update.</p>}
          {review.status === 'CANCELLED' ? <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">This review has been cancelled.{review.cancellationReason ? ` ${review.cancellationReason}` : ''}</p> : <ol className="mt-5 space-y-0 sm:mt-7" aria-label="Feedback review stages">{STAGES.map((stage,index) => <li key={stage.value} className="relative flex gap-4 pb-6 last:pb-0">{index < STAGES.length-1 && <span className={`absolute left-[15px] top-8 h-full w-0.5 ${index < current ? 'bg-blue-500' : 'bg-gray-200'}`} />}<span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${index < current ? 'bg-blue-600 text-white' : index === current ? 'bg-blue-100 font-bold text-blue-800 ring-2 ring-blue-600' : 'bg-gray-100 text-gray-500'}`}>{index < current ? <Check className="h-4 w-4" /> : index+1}</span><div className="pt-1"><p className={`text-sm ${index === current ? 'font-semibold text-blue-800' : 'text-gray-600'}`}>{stage.label}</p>{index === current && <p className="mt-1 text-xs text-gray-500">Current stage</p>}</div></li>)}</ol>}
        </section>
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 sm:p-5"><h2 className="font-semibold text-gray-900">Your full feedback history</h2><p className="mt-2 text-sm text-gray-600">Sign in with your review email to see all your drafts, history and turnaround times.</p><div className="mt-3 flex flex-wrap gap-2"><Link className={buttonClass} href="/signin?callbackUrl=%2Ffeedback">Sign in</Link><Link className={secondaryClass} href={`/feedback/signup?token=${encodeURIComponent(token)}`}>Create an account</Link></div></section>
        <p className="text-center text-xs text-gray-500">Status refreshes automatically every minute. </p>
      </>}
    </div>
  </Layout>;
}
