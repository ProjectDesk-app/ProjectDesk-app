import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { LoadingState } from "@/components/LoadingState";
import TaskSetScheduleEditor from "@/components/TaskSetScheduleEditor";
import ApplyTaskSetModal from "@/components/ApplyTaskSetModal";
import { dateOnly, ScheduleTemplate, validateTemplates } from "@/lib/taskSetSchedule";

const fetcher = async (url: string) => {
  const response = await fetch(url), data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load task set.");
  return data;
};

export default function TaskSetDetails() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session, status } = useSession();
  const canManage = ["SUPERVISOR", "ADMIN"].includes((session?.user as any)?.role);
  const { data, error, mutate } = useSWR(id && canManage ? `/api/tasksets/${id}` : null, fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setStartDate(data.scheduleStartDate ? dateOnly(data.scheduleStartDate) : "");
    setTemplates(data.templates);
    setDirty(false);
  }, [data]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try { validateTemplates(templates); } catch (error) { toast.error((error as Error).message); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/tasksets/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scheduleStartDate: startDate || null, templates }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save timetable.");
      await mutate(result, false);
      setDirty(false);
      toast.success("Timetable saved");
    } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); }
  };
  const duplicate = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/tasksets/${id}/duplicate`, { method: "POST" }), result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to duplicate.");
      await router.push(`/supervisor/task-sets/${result.id}`);
    } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); }
  };
  if (status === "loading") return <Layout title="Task set"><LoadingState title="Loading task set" /></Layout>;
  if (!canManage) return <Layout title="Access denied"><p>Access denied.</p></Layout>;
  if (error) return <Layout title="Task set"><p role="alert" className="text-red-700">{error.message}</p></Layout>;
  if (!data) return <Layout title="Task set"><LoadingState title="Loading timetable" /></Layout>;
  return <Layout title={data.name}>
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <button type="button" onClick={() => { if (!dirty || window.confirm("Leave without saving this timetable?")) router.push("/supervisor/task-library"); }} className="text-blue-700 hover:underline">← Task library</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={duplicate} disabled={saving || dirty} className="rounded border px-4 py-2 disabled:opacity-50">Duplicate for next year</button>
          <button type="button" onClick={() => setApplyOpen(true)} disabled={saving || dirty || !templates.some(t => t.kind !== "BREAK")} className="rounded border border-blue-600 px-4 py-2 text-blue-700 disabled:opacity-50">Apply to project</button>
        </div>
      </div>
      <p className="text-sm text-gray-600">Save this timetable once, then apply it to each project. Changing this set does not change tasks already created in projects.</p>
      {dirty && <p role="status" className="text-sm text-amber-800">Unsaved changes. Save before applying or duplicating.</p>}
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={saving} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Task set name
            <input required maxLength={200} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">Timetable start (optional)
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDirty(true); }} className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
        </fieldset>
        <p className="text-sm text-gray-600">Move the timetable start to shift the whole schedule, then adjust individual dates. Leave it blank for a task set relative to each project's start.</p>
        <TaskSetScheduleEditor startDate={startDate} templates={templates} onChange={items => { setTemplates(items); setDirty(true); }} disabled={saving} />
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !dirty} className="rounded bg-blue-600 px-5 py-2 text-white disabled:opacity-50">{saving ? "Saving…" : "Save timetable"}</button>
        </div>
      </form>
      <ApplyTaskSetModal open={applyOpen} onClose={() => setApplyOpen(false)} taskSet={data} />
    </div>
  </Layout>;
}
