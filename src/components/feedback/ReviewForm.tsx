import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { ModalShell } from '@/components/account/ModalShell';
import { api, buttonClass, formatDate, inputClass, Preset, Review, secondaryClass, today } from './shared';

export default function ReviewForm({previous,presets,onClose,onSaved}: {previous?: Review;presets: Preset[];onClose:()=>void;onSaved:(warning?:string)=>void}) {
  const [name,setName] = useState(previous?.recipientName || '');
  const [email,setEmail] = useState(previous?.recipientEmail || '');
  const [title,setTitle] = useState(previous?.title || '');
  const [workType,setWorkType] = useState(previous?.workType || presets[0]?.name || 'Other');
  const initial = presets.find(p => p.name === (previous?.workType || presets[0]?.name));
  const [minDays,setMinDays] = useState(initial?.minDays ?? 2);
  const [maxDays,setMaxDays] = useState(initial?.maxDays ?? 5);
  const [receivedDate,setReceivedDate] = useState(today());
  const [manual,setManual] = useState(false);
  const [estimateStart,setEstimateStart] = useState('');
  const [estimateEnd,setEstimateEnd] = useState('');
  const [previousAction,setPreviousAction] = useState('');
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const {data: estimate,error: estimateError} = useSWR(receivedDate && minDays >= 0 && maxDays >= minDays ? `/api/feedback/estimate?receivedDate=${receivedDate}&minDays=${minDays}&maxDays=${maxDays}` : null, (url: string) => api<any>(url));
  useEffect(() => {if (estimate && !manual) {setEstimateStart(estimate.estimateStart);setEstimateEnd(estimate.estimateEnd);}}, [estimate,manual]);
  const field = (label:string,child:React.ReactNode) => <label className="block space-y-1.5"><span className="text-sm font-medium text-gray-700">{label}</span>{child}</label>;
  async function submit(e:FormEvent) {e.preventDefault();setSaving(true);setError('');try {const result = await api('/api/feedback','POST',{recipientName:name,recipientEmail:email,title,workType,receivedDate,minDays,maxDays,...(manual ? {estimateStart,estimateEnd} : {}),...(previous ? {workId:previous.workId,previousAction} : {})});onSaved(result.warning);}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
  return <ModalShell open onClose={()=> !saving && onClose()} title={previous ? 'Add next draft version' : 'Add work for feedback'}><form className="space-y-4" onSubmit={submit}>
    {previous ? <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">A new review of <strong>{previous.title}</strong> for {previous.recipientName}. Previous versions and their history will be kept.</p> : <><div className="grid gap-3 sm:grid-cols-2">{field('Recipient name',<input required maxLength={200} className={inputClass} value={name} onChange={e=>setName(e.target.value)} />)}{field('Recipient email',<input required type="email" className={inputClass} value={email} onChange={e=>setEmail(e.target.value)} />)}</div>{field('Title of work',<input required maxLength={300} className={inputClass} value={title} onChange={e=>setTitle(e.target.value)} />)}</>}
    {!previous && field('Type of work',<select className={inputClass} value={workType} onChange={e=>{setWorkType(e.target.value);const preset=presets.find(p=>p.name===e.target.value);if(preset){setMinDays(preset.minDays);setMaxDays(preset.maxDays);}}}>{Array.from(new Set([...presets.map(p=>p.name),'Other',workType])).map(name=><option key={name}>{name}</option>)}</select>)}
    {field('Date received',<input required type="date" max={today()} className={inputClass} value={receivedDate} onChange={e=>setReceivedDate(e.target.value)} />)}
    <fieldset><legend className="mb-2 text-sm font-medium">Turnaround in working days</legend><div className="grid grid-cols-2 gap-3">{field('Earliest',<input required type="number" min={1} max={365} className={inputClass} value={minDays} onChange={e=>setMinDays(Number(e.target.value))} />)}{field('Latest',<input required type="number" min={Math.max(1,minDays)} max={365} className={inputClass} value={maxDays} onChange={e=>setMaxDays(Number(e.target.value))} />)}</div><p className="mt-2 text-xs text-gray-500">Counted from the next working day. Weekends and England and Wales bank holidays are excluded.</p></fieldset>
    {!manual && <p className="rounded-lg bg-gray-50 p-3 text-sm">{estimate ? `Estimated return: ${formatDate(estimate.estimateStart)} – ${formatDate(estimate.estimateEnd)}` : estimateError ? 'Unable to calculate estimates. Try again or choose dates manually.' : 'Calculating estimated return…'}</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)} />Choose specific return dates</label>
    {manual && <div className="grid grid-cols-2 gap-3">{field('Earliest return',<input required type="date" min={receivedDate} className={inputClass} value={estimateStart} onChange={e=>setEstimateStart(e.target.value)} />)}{field('Latest return',<input required type="date" min={estimateStart || receivedDate} className={inputClass} value={estimateEnd} onChange={e=>setEstimateEnd(e.target.value)} />)}</div>}
    {previous && <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-medium">If an earlier version is still active</legend><label className="mt-2 flex gap-2 text-sm"><input required type="radio" name="previousAction" value="supersede" checked={previousAction==='supersede'} onChange={e=>setPreviousAction(e.target.value)} />Cancel earlier active reviews as superseded</label><label className="mt-2 flex gap-2 text-sm"><input type="radio" name="previousAction" value="keep" checked={previousAction==='keep'} onChange={e=>setPreviousAction(e.target.value)} />Keep earlier reviews active</label></fieldset>}
    <p className="text-xs text-gray-500">Adding this review sends a receipt email with its tracking link. Documents and feedback are exchanged elsewhere.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={saving} className={secondaryClass} onClick={onClose}>Cancel</button><button disabled={saving || (!manual && !estimate)} className={buttonClass}>{saving ? 'Adding…' : 'Add review & send receipt'}</button></div>
  </form></ModalShell>;
}
