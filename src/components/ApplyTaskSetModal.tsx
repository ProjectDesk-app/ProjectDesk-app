import { Dialog } from "@headlessui/react";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import TaskSetTimeline from "./TaskSetTimeline";
import { dateOnly } from "@/lib/taskSetSchedule";
import { useSession } from "next-auth/react";

interface Props { open: boolean; onClose: () => void; taskSet: any | null; }

export default function ApplyTaskSetModal({ open, onClose, taskSet }: Props) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id;
  const userRole = (session?.user as any)?.role;
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [dateMode, setDateMode] = useState("project");
  const [customStart, setCustomStart] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState("");
  const [projectError, setProjectError] = useState("");
  useEffect(() => {
    if (!open || !taskSet) return;
    const controller = new AbortController();
    setSelectedProject(""); setError(""); setProjectError(""); setProjects([]);
    setDateMode(taskSet.scheduleStartDate ? "timetable" : "project");
    setCustomStart(taskSet.scheduleStartDate ? dateOnly(taskSet.scheduleStartDate) : "");
    setLoadingProjects(true);
    fetch("/api/projects", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unable to load projects.");
      return response.json();
    }).then(data => setProjects(Array.isArray(data) ? data.filter(project => !project.isCompleted &&
      (userRole === "ADMIN" || Number(project.supervisorId) === Number(userId))) : []))
      .catch(error => { if (error.name !== "AbortError") setProjectError("Unable to load projects. Close this dialog and try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingProjects(false); });
    return () => controller.abort();
  }, [open, taskSet, userId, userRole]);
  if (!open || !taskSet) return null;
  const project = projects.find(p => String(p.id) === selectedProject);
  const base = dateMode === "timetable" ? (taskSet.scheduleStartDate ? dateOnly(taskSet.scheduleStartDate) : "") :
    dateMode === "project" ? (project?.startDate ? dateOnly(project.startDate) : "") : customStart;
  const templates = taskSet.templates || [];
  const taskCount = templates.filter((t: any) => t.kind !== "BREAK").length;
  const apply = async () => {
    if (!selectedProject || !base) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/tasksets/${taskSet.id}/apply`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: Number(selectedProject), dateMode, ...(dateMode === "custom" ? { scheduleStartDate: customStart } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to apply task set.");
      toast.success(`${data.tasksCreated} tasks created in ${project.title}`);
      onClose();
    } catch (error) { setError((error as Error).message); } finally { setLoading(false); }
  };
  return <Dialog open={open} onClose={() => !loading && onClose()} className="relative z-50">
    <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
    <div className="fixed inset-0 overflow-y-auto p-4">
      <Dialog.Panel className="mx-auto my-4 w-full max-w-4xl space-y-5 rounded-lg bg-white p-6 shadow-lg">
        <Dialog.Title className="text-xl font-semibold">Apply “{taskSet.name}” to a project</Dialog.Title>
        {loadingProjects ? <p role="status">Loading projects…</p> : projectError ? <p role="alert" className="text-red-700">{projectError}</p> : !projects.length ? <p>No active projects available.</p> :
          <fieldset disabled={loading} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Project
              <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setError(""); }} className="mt-1 block w-full rounded border px-3 py-2">
                <option value="">Select a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Schedule dates
              <select value={dateMode} onChange={e => { setDateMode(e.target.value); setError(""); }} className="mt-1 block w-full rounded border px-3 py-2">
                {taskSet.scheduleStartDate && <option value="timetable">Use the shared timetable dates</option>}
                <option value="project">Shift from this project's start</option>
                <option value="custom">Choose another start date</option>
              </select>
            </label>
            {dateMode === "custom" && <label className="text-sm font-medium">Schedule start
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="mt-1 block w-full rounded border px-3 py-2" />
            </label>}
          </fieldset>}
        {dateMode === "timetable" && <p className="text-sm text-gray-600">All projects using this timetable receive the same dates, regardless of when their project record was created.</p>}
        {selectedProject && dateMode === "project" && !base && <p role="alert" className="text-amber-800">This project has no start date. Choose another start date above.</p>}
        {base && <TaskSetTimeline templates={templates} startDate={base} />}
        <p className="text-sm text-gray-600">{taskCount} tasks will be created. Breaks are shown for reference and do not pause tasks. Due times use UK time.</p>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading} className="rounded bg-gray-200 px-4 py-2">Cancel</button>
          <button type="button" onClick={apply} disabled={loading || loadingProjects || !selectedProject || !base || !taskCount} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{loading ? "Applying…" : "Create tasks in project"}</button>
        </div>
      </Dialog.Panel>
    </div>
  </Dialog>;
}
