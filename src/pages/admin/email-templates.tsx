import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import Layout from "@/components/Layout";
import { EmailNavigation } from "@/components/admin/EmailNavigation";

type Template = {
  id: string; name: string; category: string; description: string;
  subject: string; body: string; buttonLabel: string | null; hasButton: boolean;
  variables: { key: string; label: string; sample: string }[];
  requiredVariables: string[]; isCustomized: boolean; version: number;
};
type Draft = { subject: string; body: string; buttonLabel: string };
type Preview = { subject: string; html: string; text: string };
const input = "block w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const button = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
function draftFor(template: Template): Draft { return { subject: template.subject, body: template.body, buttonLabel: template.buttonLabel || "" }; }
async function request(url: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 409 ? "This template changed since you opened it. Reload the templates before saving again." : result.error || "Unable to process this request.");
  return result;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null), [previewError, setPreviewError] = useState(""), [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [recipient, setRecipient] = useState(""), [previewMode, setPreviewMode] = useState("desktop"), [showText, setShowText] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [insertionTarget, setInsertionTarget] = useState<"subject" | "body">("body");
  const dirty = Boolean(selected && draft && JSON.stringify(draftFor(selected)) !== JSON.stringify(draft));
  const busy = saving || sending;

  function choose(template: Template) {
    if (busy || (dirty && !window.confirm("Discard your unsaved wording changes and open another template?"))) return;
    setSelected(template); setDraft(draftFor(template)); setError(""); setSuccess(""); setPreview(null); setPreviewError("");
  }
  async function loadTemplates(force = false) {
    if (!force && dirty && !window.confirm("Reload templates and discard your unsaved changes?")) return;
    setLoading(true); setLoadError("");
    try {
      const result = await request("/api/admin/email-templates");
      const next: Template[] = result.templates;
      setTemplates(next);
      const first = next.find(item => item.id === selected?.id) || next[0];
      setSelected(first || null); setDraft(first ? draftFor(first) : null); setError(""); setSuccess("");
    } catch (error: any) { setLoadError(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadTemplates(true); }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    setPreview(null); setPreviewError("");
    if (!selected || !draft) return;
    const controller = new AbortController();
    setPreviewing(true);
    const timer = setTimeout(() => {
      request("/api/admin/email-templates/preview", "POST", { id: selected.id, ...draft }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setPreview(result); })
        .catch(error => { if (!controller.signal.aborted) setPreviewError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setPreviewing(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected?.id, draft]);

  function edit(key: keyof Draft, value: string) { setDraft(previous => previous ? { ...previous, [key]: value } : previous); setError(""); setSuccess(""); }
  function insertPlaceholder(key: string) {
    const element = insertionTarget === "subject" ? subjectRef.current : bodyRef.current;
    if (!element || !draft) return;
    const value = draft[insertionTarget], start = element.selectionStart ?? value.length, end = element.selectionEnd ?? start;
    const token = `{{${key}}}`;
    edit(insertionTarget, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + token.length, start + token.length); });
  }
  function acceptSaved(template: Template) {
    setTemplates(previous => previous.map(item => item.id === template.id ? template : item));
    setSelected(template); setDraft(draftFor(template));
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!selected || !draft || busy) return;
    setSaving(true); setError(""); setSuccess("");
    try { const result = await request(`/api/admin/email-templates/${encodeURIComponent(selected.id)}`, "PUT", { ...draft, version: selected.version }); acceptSaved(result.template); setSuccess("Template saved. Future emails will use this wording."); }
    catch (error: any) { setError(error.message); }
    finally { setSaving(false); }
  }
  async function reset() {
    if (!selected || busy || !window.confirm("Restore the default wording for this template? This discards your unsaved changes and removes its saved customisation.")) return;
    setSaving(true); setError(""); setSuccess("");
    try { const result = await request(`/api/admin/email-templates/${encodeURIComponent(selected.id)}`, "DELETE", { version: selected.version }); acceptSaved(result.template); setSuccess("Default wording restored."); }
    catch (error: any) { setError(error.message); }
    finally { setSaving(false); }
  }
  async function sendTest(event: FormEvent) {
    event.preventDefault(); if (!selected || !draft || busy || !preview) return;
    if (!window.confirm(`Send a real test email to ${recipient.trim()} using this draft and example details? Unsaved wording will not be published.`)) return;
    setSending(true); setError(""); setSuccess("");
    try { const result = await request("/api/admin/email-templates/test", "POST", { id: selected.id, ...draft, to: recipient.trim() }); setSuccess(result.mocked ? "Test rendered in mock mode. No email was delivered; see Delivery logs." : "Test email sent using example details."); }
    catch (error: any) { setError(error.message); }
    finally { setSending(false); }
  }
  const visible = templates.filter(item => `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  const categories = Array.from(new Set(visible.map(item => item.category)));
  return <Layout title="Email templates" fluid><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-gray-900">Email Centre</h1><p className="mt-2 text-sm text-gray-600">Preview and adjust notification wording. Layout, dates and link destinations stay managed by Project Desk.</p></div><Link href="/admin" className="text-sm font-medium text-blue-700 hover:underline">Admin dashboard</Link></header>
    <EmailNavigation />
    {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError} <button onClick={() => loadTemplates()} className="font-semibold underline">Try again</button></div>}
    {loading ? <p role="status" className="py-12 text-center text-gray-500">Loading email templates…</p> : <div className="grid min-w-0 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border border-gray-200 bg-white p-3"><label className="block text-xs font-semibold text-gray-600" htmlFor="template-search">Find a template</label><input id="template-search" type="search" placeholder="Search notifications…" value={query} onChange={event => setQuery(event.target.value)} className={`${input} mt-2`} /><div className="mt-4 max-h-72 space-y-4 overflow-y-auto lg:max-h-[75vh]">{categories.map(category => <section key={category}><h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</h2><div className="mt-1 space-y-1">{visible.filter(item => item.category === category).map(template => <button key={template.id} disabled={busy} onClick={() => choose(template)} aria-current={selected?.id === template.id ? "true" : undefined} className={`block w-full rounded-lg px-2 py-2 text-left text-sm ${selected?.id === template.id ? "bg-blue-50 font-semibold text-blue-800" : "text-gray-700 hover:bg-gray-50"}`}>{template.name}{template.isCustomized && <span className="ml-1 text-[10px] font-normal text-blue-600">Edited</span>}</button>)}</div></section>)}{!visible.length && <p className="px-2 text-sm text-gray-500">No matching templates.</p>}</div></aside>
      {selected && draft ? <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-gray-900">{selected.name}</h2><p className="mt-1 text-sm text-gray-600">{selected.description}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${dirty ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{dirty ? "Unsaved changes" : selected.isCustomized ? "Custom wording" : "Default wording"}</span></div>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button onClick={() => loadTemplates()} disabled={busy} className="ml-2 font-semibold underline">Reload templates</button></div>}
        {success && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</p>}
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
          <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-5"><form className="space-y-4" onSubmit={save}><fieldset disabled={busy} className="min-w-0 space-y-4"><legend className="mb-3 font-semibold text-gray-900">Edit wording</legend><label className="block space-y-1.5"><span className="text-sm font-medium text-gray-700">Subject</span><input ref={subjectRef} required maxLength={300} value={draft.subject} onFocus={() => setInsertionTarget("subject")} onChange={event => edit("subject", event.target.value)} className={input} /></label><label className="block space-y-1.5"><span className="text-sm font-medium text-gray-700">Email body</span><textarea ref={bodyRef} required maxLength={20000} rows={13} value={draft.body} onFocus={() => setInsertionTarget("body")} onChange={event => edit("body", event.target.value)} className={`${input} font-mono leading-relaxed`} /></label>{selected.hasButton && <label className="block space-y-1.5"><span className="text-sm font-medium text-gray-700">Button text</span><input required maxLength={60} value={draft.buttonLabel} onChange={event => edit("buttonLabel", event.target.value)} className={input} /></label>}
          <div className="rounded-lg bg-gray-50 p-3"><h3 className="text-xs font-semibold text-gray-700">Dynamic details</h3><p className="mt-1 text-xs leading-relaxed text-gray-500">Click a placeholder to insert it into the subject or body you last selected. These are filled with the real details when an email is sent.</p><div className="mt-2 flex flex-wrap gap-1.5">{selected.variables.filter(variable => variable.key !== "actionUrl").map(variable => <button type="button" key={variable.key} title={`${variable.label}: ${variable.sample}`} onClick={() => insertPlaceholder(variable.key)} className="max-w-full break-all rounded border border-gray-200 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">{`{{${variable.key}}}`}</button>)}{selected.hasButton && <button type="button" onClick={() => { setInsertionTarget("body"); const field = bodyRef.current; if (field) { const start = field.selectionStart ?? draft.body.length; edit("body", draft.body.slice(0, start) + "{{action}}" + draft.body.slice(field.selectionEnd ?? start)); field.focus(); } }} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-blue-700">{"{{action}}"}</button>}</div>{selected.hasButton && <p className="mt-2 text-xs text-gray-500">Keep {"{{action}}"} in the body. The button destination is protected and cannot be changed here.</p>}{selected.requiredVariables.length > 0 && <p className="mt-2 break-words text-xs text-gray-500">Required: {selected.requiredVariables.map(key => `{{${key}}}`).join(", ")}</p>}</div></fieldset><div className="flex flex-wrap gap-2 border-t pt-4"><button className={button} disabled={busy || !dirty || !preview || previewing}>{saving ? "Saving…" : "Save template"}</button><button type="button" className={secondary} disabled={busy || (!selected.isCustomized && !dirty)} onClick={reset}>Reset to default</button></div><p className="text-xs text-gray-500">Saving changes future emails across Project Desk. It does not send an email or alter messages already delivered.</p></form></section>
          <section className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-gray-900">Preview with example details</h3><div className="flex gap-1"><button className={`${secondary} ${previewMode === "desktop" ? "border-blue-400 text-blue-700" : ""}`} onClick={() => setPreviewMode("desktop")}>Desktop</button><button className={`${secondary} ${previewMode === "mobile" ? "border-blue-400 text-blue-700" : ""}`} onClick={() => setPreviewMode("mobile")}>Mobile</button></div></div>{previewError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{previewError}</p>}{previewing && <p role="status" className="text-sm text-gray-500">Updating preview…</p>}{preview && <><p className="break-words rounded-lg border bg-white p-3 text-sm"><span className="font-semibold">Subject: </span>{preview.subject}</p><div className="min-w-0 rounded-xl border border-gray-200 bg-gray-100 p-2"><iframe title="Email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} className="mx-auto block h-[640px] w-full rounded-lg bg-white" style={{ maxWidth: previewMode === "mobile" ? 375 : undefined }} /></div><button type="button" className="text-xs font-medium text-blue-700 underline" onClick={() => setShowText(previous => !previous)}>{showText ? "Hide plain-text version" : "Show plain-text version"}</button>{showText && <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-white p-3 text-xs text-gray-700">{preview.text}</pre>}</>}
          <form className="space-y-3 rounded-xl border border-gray-200 bg-white p-4" onSubmit={sendTest}><h3 className="text-sm font-semibold text-gray-900">Send this draft as a test</h3><p className="text-xs leading-relaxed text-gray-500">This sends a real email with example details and example links. It does not publish unsaved changes or create a real invitation, password reset, or tracking link.</p><label className="block space-y-1"><span className="text-sm font-medium text-gray-700">Test recipient</span><input type="email" required maxLength={254} value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="you@example.com" className={input} /></label><button className={secondary} disabled={busy || !preview || previewing}>{sending ? "Sending…" : "Send test email"}</button></form></section>
        </div>
      </div> : <p className="py-12 text-sm text-gray-500">No email templates are available.</p>}
    </div>}
  </div></Layout>;
}

export const getServerSideProps: GetServerSideProps = async ctx => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") return { redirect: { destination: "/signin", permanent: false } };
  return { props: {} };
};
