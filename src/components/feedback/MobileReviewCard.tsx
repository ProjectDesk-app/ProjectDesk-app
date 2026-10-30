import { Review, STAGES, StatusBadge, buttonClass, secondaryClass, inputClass, formatDate } from './shared';

type Props = {
  review: Review;
  canManage: boolean;
  busy: boolean;
  settingsReady: boolean;
  onDetails: () => void;
  onRecipientHistory: () => void;
  onNextVersion: () => void;
  onStage: (status: string) => void;
  onRequestUpdate: () => void;
};

export default function MobileReviewCard({ review, canManage, busy, settingsReady, onDetails, onRecipientHistory, onNextVersion, onStage, onRequestUpdate }: Props) {
  const active = !['COMPLETED', 'CANCELLED'].includes(review.status);
  return (
    <article className="min-w-0 space-y-4 p-4">
      <div className="min-w-0">
        <button className="max-w-full break-words text-left text-base font-semibold text-gray-900 hover:text-blue-700 hover:underline" onClick={onDetails}>
          {review.title} <span className="ml-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 align-middle text-xs font-medium text-gray-600">V{review.version}</span>
        </button>
        <p className="mt-1 break-words text-xs text-gray-500">{review.workType}</p>
        <button className="mt-2 max-w-full break-words text-left text-sm font-medium text-blue-700 hover:underline" onClick={onRecipientHistory}>{review.isOwner ? review.recipientName : review.supervisorName}</button>
        {review.isOwner && <p className="mt-0.5 break-all text-xs text-gray-500">{review.recipientEmail}</p>}
      </div>
      {active && review.queuePosition != null && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">Queue: {review.queuePosition} of {review.queueTotal}<span className="ml-2 text-xs font-normal">{review.queueAhead === 0 ? 'Next in queue' : `${review.queueAhead ?? review.queuePosition - 1} ahead`}</span></p>}
      {review.isOwner && canManage ? <div className="space-y-1.5">
        <label className="block text-xs font-medium text-gray-500" htmlFor={`mobile-stage-${review.id}`}>Progress</label>
        <select id={`mobile-stage-${review.id}`} className={`${inputClass} min-h-11`} disabled={busy} value={review.status} onChange={event => onStage(event.target.value)}>
          {STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
          <option value="CANCELLED">Cancelled</option>
        </select>
        {review.overdue && <p className="text-xs font-medium text-amber-700">Overdue</p>}
      </div> : <StatusBadge status={review.status} overdue={review.overdue} />}
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-gray-500">Estimated return</dt><dd className="mt-1 break-words">{formatDate(review.estimateStart)} – {formatDate(review.estimateEnd)}</dd></div>
        <div><dt className="text-xs text-gray-500">Received</dt><dd className="mt-1">{formatDate(review.receivedDate)}</dd></div>
        {review.completedAt && <div><dt className="text-xs text-gray-500">Returned</dt><dd className="mt-1 text-emerald-700">{formatDate(review.completedAt)}</dd></div>}
        {review.turnaroundWorkingDays != null && <div><dt className="text-xs text-gray-500">Turnaround</dt><dd className="mt-1">{review.turnaroundWorkingDays} working days</dd></div>}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <button className={`${secondaryClass} min-h-11`} onClick={onDetails}>View history</button>
        {review.isOwner && canManage && <button className={`${secondaryClass} min-h-11`} disabled={!settingsReady} onClick={onNextVersion}>Add next version</button>}
        {!review.isOwner && review.overdue && <div className="space-y-1">
          <button className={`${buttonClass} min-h-11`} disabled={!review.canRequestUpdate || busy} onClick={onRequestUpdate}>{busy ? 'Sending…' : review.canRequestUpdate ? 'Request update' : 'Update requested'}</button>
          {!review.canRequestUpdate && review.nextRequestDate && <p className="text-xs text-gray-500">Available {formatDate(review.nextRequestDate)}</p>}
        </div>}
      </div>
    </article>
  );
}
