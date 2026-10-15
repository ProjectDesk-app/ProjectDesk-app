import { Dialog } from "@headlessui/react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import TaskSetScheduleEditor from "./TaskSetScheduleEditor";
import { ScheduleTemplate, validateTemplates } from "@/lib/taskSetSchedule";
import { L6_START, L6_REVIEW_NOTES, l6Schedule } from "@/lib/l6Schedule";

export default function TaskSetModal({ isOpen, onClose, mutate }: any) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [source, setSource] = useState("blank");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) { setName(""); setStartDate(""); setTemplates([]); setSource("blank"); }
  }, [isOpen]);

  const selectSource = (value: string) => {
    if (templates.length && !window.confirm("Replace the items currently in this draft?")) return;
    setSource(value);
    setTemplates(value === "l6" ? l6Schedule() : []);
    setStartDate(value === "l6" ? L6_START : "");
    setName(value === "l6" ? "L6 dissertation 2026–27" : "");
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { validateTemplates(templates); } catch (error) { toast.error((error as Error).message); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/tasksets", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scheduleStartDate: startDate || null, templates }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create task set.");
      await mutate();
      toast.success("Task set created");
      onClose();
    } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); }
  };
  return <Dialog open={isOpen} onClose={() => !saving && onClose()} className="relative z-50">
    <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
    <div className="fixed inset-0 overflow-y-auto p-4">
      <Dialog.Panel className="mx-auto my-4 w-full max-w-5xl rounded-lg bg-white p-6 shadow-lg">
        <Dialog.Title className="mb-4 text-xl font-semibold">Create task set</Dialog.Title>
        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset disabled={saving} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Start with
              <select value={source} onChange={e => selectSource(e.target.value)} className="mt-1 block w-full rounded border px-3 py-2">
                <option value="blank">Empty task set</option><option value="l6">L6 dissertation Gantt chart (2026–27)</option>
              </select>
            </label>
            <label className="text-sm font-medium">Name
              <input className="mt-1 block w-full rounded border px-3 py-2" value={name} onChange={e => setName(e.target.value)} required maxLength={200} />
            </label>
            <label className="text-sm font-medium">Timetable start (optional)
              <input type="date" className="mt-1 block w-full rounded border px-3 py-2" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </label>
            <p className="self-end text-sm text-gray-600">Changing the timetable start shifts all dates by the same number of calendar days. You can then adjust individual deadlines.</p>
          </fieldset>
          {source === "l6" && <section className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <h3 className="font-semibold">Two source dates to check</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Draft reading uses the March 2027 column. Its cell says March 2026.</li>
              <li>In the source, rewrite and formatting run through 25 April, beyond the 22 April submission. Adjust those dates below if needed.</li>
            </ul>
            <details><summary className="cursor-pointer">How the chart was converted</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{L6_REVIEW_NOTES.filter((_, index) => index !== 1).map(note => <li key={note}>{note}</li>)}</ul>
            </details>
          </section>}
          <TaskSetScheduleEditor templates={templates} startDate={startDate} onChange={setTemplates} disabled={saving} />
          <div className="flex justify-end gap-3 border-t pt-4">
            <button type="button" onClick={onClose} disabled={saving} className="rounded bg-gray-200 px-4 py-2">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{saving ? "Creating…" : "Create task set"}</button>
          </div>
        </form>
      </Dialog.Panel>
    </div>
  </Dialog>;
}
