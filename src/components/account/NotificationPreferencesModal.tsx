import { FormEvent, useEffect, useState } from "react";
import { ModalShell } from "./ModalShell";

type DeliveryMode = "IMMEDIATE" | "DAILY" | "IN_APP";
type Preferences = {
  taskComments: DeliveryMode;
  taskFlags: DeliveryMode;
  projectStatus: DeliveryMode;
  deadlineSummary: boolean;
  taskAssignments: boolean;
  taskDeadlineChanges: boolean;
};
type Props = { open: boolean; onClose: () => void; feedbackOnly?: boolean };

const deliveryFields = [
  { key: "taskComments", label: "New task comments", description: "Comments from other people on your project tasks." },
  { key: "taskFlags", label: "Tasks flagged for assistance", description: "Requests for help on projects you supervise." },
  { key: "projectStatus", label: "Project status changes", description: "When a project becomes Behind Schedule, At Risk, or Danger. Returning to On Track does not send a notification." },
] as const;

export function NotificationPreferencesModal({ open, onClose, feedbackOnly = false }: Props) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setPreferences(null);
    setError(null);
    setSuccess(null);
    fetch("/api/account/notification-preferences", { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Unable to load notification preferences.");
        if (!controller.signal.aborted) setPreferences(payload);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error?.message || "Unable to load notification preferences.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, attempt]);

  function change<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences(previous => previous ? { ...previous, [key]: value } : previous);
    setSuccess(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preferences || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to save notification preferences.");
      setSuccess("Notification preferences saved.");
    } catch (error: any) {
      setError(error?.message || "Unable to save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  return <ModalShell open={open} onClose={() => !saving && onClose()} title="Notification preferences" footer={<>
    <button type="button" disabled={saving} onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60">Close</button>
    <button type="submit" form="notification-preferences-form" disabled={loading || saving || !preferences} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Saving…" : "Save preferences"}</button>
  </>}>
    <p className="text-sm text-gray-600">Choose how Project Desk keeps you informed about tasks and projects. Email choices below always retain the in-app alert.</p>
    {feedbackOnly && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Your account currently has Feedback Hub access only. These preferences apply if you also use project tools in future.</p>}
    {loading && <p role="status" className="py-6 text-center text-gray-500">Loading your preferences…</p>}
    {preferences && <form id="notification-preferences-form" className="min-w-0 space-y-5" onSubmit={save}>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="mb-3 font-semibold text-gray-900">Comments, assistance and project status</legend>
        {deliveryFields.map(field => <div key={field.key} className="min-w-0 space-y-1.5">
          <label htmlFor={`notify-${field.key}`} className="block font-medium text-gray-800">{field.label}</label>
          <p id={`notify-${field.key}-description`} className="text-xs leading-relaxed text-gray-500">{field.description}</p>
          <select id={`notify-${field.key}`} aria-describedby={`notify-${field.key}-description`} value={preferences[field.key]} onChange={event => change(field.key, event.target.value as DeliveryMode)} className="min-h-11 w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="IMMEDIATE">Immediate email</option>
            <option value="DAILY">Daily email summary</option>
            <option value="IN_APP">In-app only</option>
          </select>
        </div>)}
        <p className="text-xs leading-relaxed text-gray-500">Project status is automatically checked at 1 am UK time on working days.</p>
      </fieldset>
      <fieldset className="space-y-3 border-t border-gray-200 pt-4" disabled={saving}>
        <legend className="px-0 pt-4 font-semibold text-gray-900">Deadline reminders</legend>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300" checked={preferences.deadlineSummary} onChange={event => change("deadlineSummary", event.target.checked)} /><span>Email me a morning deadline summary<span className="mt-1 block text-xs leading-relaxed text-gray-500">Tasks due within the next three calendar days and overdue tasks. Students and collaborators see their assignments; supervisors also get an overview of their projects.</span></span></label>
        <p className="text-xs leading-relaxed text-gray-500">Daily summaries arrive at 9 am UK time on working days, excluding weekends and England and Wales bank holidays. Empty summaries are skipped.</p>
      </fieldset>
      <fieldset className="space-y-3 border-t border-gray-200 pt-4" disabled={saving}>
        <legend className="px-0 pt-4 font-semibold text-gray-900">In-app alerts only</legend>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300" checked={preferences.taskAssignments} onChange={event => change("taskAssignments", event.target.checked)} /><span>Tasks assigned or reassigned to me</span></label>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300" checked={preferences.taskDeadlineChanges} onChange={event => change("taskDeadlineChanges", event.target.checked)} /><span>Changes to deadlines on my assigned tasks</span></label>
        <p className="text-xs text-gray-500">These changes never send an email.</p>
      </fieldset>
      <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">Feedback Hub receipt and completion emails are unchanged. Its supervisor daily summary is managed separately in Feedback Hub settings.</p>
    </form>}
    {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p>{!preferences && !loading && <button type="button" className="font-semibold underline" onClick={() => setAttempt(value => value + 1)}>Try again</button>}</div>}
    {success && <p role="status" className="text-sm text-green-700">{success}</p>}
  </ModalShell>;
}
