import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useFeedbackView } from '@/components/feedback/useFeedbackView';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { Check, ClipboardCheck, MessageSquare } from 'lucide-react';
import Layout from '@/components/Layout';
import { api, formatDate, STAGES, PAUSE_DESCRIPTION, StatusBadge, QueueSummary, today, buttonClass, secondaryClass } from '@/components/feedback/shared';

export default function FeedbackTracker() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const {data,error,isLoading,mutate} = useSWR(token ? `/api/feedback/track/${encodeURIComponent(token)}` : null, (url: string) => api<any>(url), {refreshInterval: 60000});
  const review = data?.review;
  const { status: sessionStatus } = useSession();
  useFeedbackView([{ token, source: 'TRACKING' }], Boolean(review) && sessionStatus !== 'loading');
  const manualUpdates: {title:string;detail:string;stage:string;createdAt:string}[] = review?.manualUpdates || [];
  const stages: {value:string;label:string;description:string;isUpdate?:boolean;createdAt?:string}[] = STAGES.flatMap(stage => [stage,
    ...(review?.pauseStages || []).filter((status: string) => status === stage.value).map((_status: string, index: number) => ({ value: `PAUSED_${stage.value}_${index}`, label: 'Process Paused', description: PAUSE_DESCRIPTION })),
    ...manualUpdates.filter(update => update.stage === stage.value).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map((update,index)=>({value:`UPDATE_${stage.value}_${index}`,label:update.title,description:update.detail,isUpdate:true,createdAt:update.createdAt})),
  ]);
  const baseCurrent = stages.findIndex(s => s.value === review?.status);
  let current = baseCurrent;
  if (review?.paused) {
    while (stages[current + 1]?.value.startsWith(`PAUSED_${review.status}_`)) current++;
  }
  const overdue = review && !['COMPLETED','CANCELLED'].includes(review.status) && review.estimateEnd < today();
  return <Layout title="Track feedback" compactGuestHeader><Head><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="no-referrer" /></Head>
    <div className="mx-auto min-w-0 max-w-2xl space-y-4 sm:space-y-6 sm:py-4">
      <div><div className="flex items-center gap-2.5 sm:justify-center"><ClipboardCheck className="h-5 w-5 shrink-0 text-blue-600 sm:h-7 sm:w-7" /><h1 className="text-lg font-semibold text-gray-900 sm:text-2xl">Track your feedback</h1></div><p className="mt-2 hidden text-center text-sm text-gray-600 sm:block">Return to this page anytime to check the status of your feedback.</p></div>
      {error ? <div role="alert" className="rounded-xl border bg-white p-6"><h2 className="font-semibold">Unable to open this review</h2><p className="mt-2 text-sm text-gray-600">{error.message}</p><button className={`${secondaryClass} mt-4`} onClick={() => mutate()}>Try again</button></div> : isLoading || !review ? <p role="status" className="py-12 text-center text-gray-500">Loading feedback progress…</p> : <>
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Version {review.version}</p><h2 className="mt-1 break-words text-lg font-semibold leading-snug text-gray-900 sm:text-xl">{review.title}</h2><p className="mt-1 break-words text-xs text-gray-600 sm:text-sm">Reviewed by {review.supervisorName}</p><div className="mt-2"><StatusBadge status={review.status} overdue={overdue} /></div></div>
          <div className="mt-4 rounded-xl bg-gray-50 p-3 sm:p-4">
            <dl><dt className="text-xs font-medium text-gray-500">Estimated feedback return</dt><dd className="mt-1 text-sm font-semibold text-gray-900">{review.estimateStart.slice(0,4) === review.estimateEnd.slice(0,4) ? new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',timeZone:'Europe/London'}).format(new Date(`${review.estimateStart}T12:00:00Z`)) : formatDate(review.estimateStart)} – {formatDate(review.estimateEnd)}{review.paused && <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Paused</span>}</dd></dl>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-3 border-t border-gray-200 pt-3">
              <dl><dt className="text-xs font-medium text-gray-500">Received</dt><dd className="mt-1 text-sm font-medium">{formatDate(review.receivedDate)}</dd></dl>
              {!['COMPLETED','CANCELLED'].includes(review.status) && <QueueSummary compact position={review.queuePosition} total={review.queueTotal} ahead={review.queueAhead} />}
              {review.completedAt && <dl><dt className="text-xs font-medium text-gray-500">Feedback returned</dt><dd className="mt-1 text-sm font-medium">{formatDate(review.completedAt)}</dd></dl>}
            </div>
          </div>
          {overdue && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The estimated return date has passed. Sign in with the email address used for this review to request an update.</p>}
          {review.status === 'CANCELLED' ? <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">This review has been cancelled.{review.cancellationReason ? ` ${review.cancellationReason}` : ''}</p> : <ol className="mt-5 space-y-0 sm:mt-7" aria-label="Feedback review stages">{stages.map((stage,index) => { const completed = stage.isUpdate || index < current || (!review.paused && stage.value.startsWith(`PAUSED_${review.status}_`)); const active = index === current; return <li key={stage.value} className="relative flex gap-4 pb-6 last:pb-0">{index < stages.length-1 && <span className={`absolute left-[15px] top-8 h-full w-0.5 ${completed ? 'bg-blue-500' : 'bg-gray-200'}`} />}<span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${completed ? 'bg-blue-600 text-white' : active ? 'bg-blue-100 font-bold text-blue-800 ring-2 ring-blue-600' : 'bg-gray-100 text-gray-500'}`}>{stage.isUpdate ? <MessageSquare className="h-4 w-4" /> : completed ? <Check className="h-4 w-4" /> : stages.slice(0,index+1).filter(s=>!s.isUpdate).length}</span><div className="pt-1"><p className={`break-words text-sm ${active ? 'font-semibold text-blue-800' : 'text-gray-600'}`}>{stage.label}</p>{stage.createdAt && <p className="mt-1 text-xs text-gray-500">{formatDate(stage.createdAt)} · {new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(stage.createdAt))} (UK time)</p>}{(stage.isUpdate || index <= current || completed) && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">{stage.description}</p>}{active && <p className="mt-1 text-xs text-gray-500">Current stage</p>}</div></li>;})}</ol>}
          {review.status === 'CANCELLED' && manualUpdates.length > 0 && <ol className="mt-4 space-y-3" aria-label="Review updates">{manualUpdates.map((update,index)=><li key={index} className="border-l-2 border-blue-200 pl-3"><p className="break-words text-sm font-semibold">{update.title}</p><p className="mt-1 text-xs text-gray-500">{formatDate(update.createdAt)} · {new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(update.createdAt))} (UK time)</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-600">{update.detail}</p></li>)}</ol>}
        </section>
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 sm:p-5"><h2 className="font-semibold text-gray-900">Your full feedback history</h2><p className="mt-2 text-sm text-gray-600">Sign in with your review email to see all your drafts, history and turnaround times.</p><div className="mt-3 flex flex-wrap gap-2"><Link className={buttonClass} href="/signin?callbackUrl=%2Ffeedback">Sign in</Link><Link className={secondaryClass} href={`/feedback/signup?token=${encodeURIComponent(token)}`}>Create an account</Link></div></section>
        <p className="text-center text-xs text-gray-500">Status refreshes automatically every minute.</p>
      </>}
    </div>
  </Layout>;
}
