import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import dynamic from "next/dynamic";
import { ViewMode, Task, EventOption } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { useState } from "react";
import { LoadingState } from "@/components/LoadingState";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const normalizeStatus = (status: unknown) =>
  typeof status === "string" ? status.toLowerCase() : String(status ?? "").toLowerCase();

function getTaskColor(t: any) {
  const status = normalizeStatus(t.status);
  if (t.flagged) return "red";
  if (status === "done") return "green";
  if (status === "in_progress") return "blue";
  if (status === "todo") return "gray";
  return "gray";
}

export default function GanttPage() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
  const { data: tasks, mutate } = useSWR(projectId ? `/api/tasks?projectId=${projectId}` : null, fetcher);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);
  const [sortMode, setSortMode] = useState<"manual" | "start" | "due">("manual");

  if (!tasks)
    return (
      <Layout title="Gantt Chart">
        <LoadingState
          title="Preparing your Gantt chart"
          message="We’re organising project tasks and timelines for a clear visual overview."
          tone="brand"
        />
      </Layout>
    );

  if (!tasks || tasks.length === 0) {
    return (
      <Layout title="Gantt Chart">
        <div className="max-w-5xl mx-auto">
          <div className="p-6 border rounded-md bg-gray-50 text-center text-gray-600">
            <h2 className="text-lg font-semibold mb-2">No Tasks Available</h2>
            <p>You can add new tasks from the Tasks tab to populate the Gantt chart.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Enhanced getTaskColor for overdue and long-duration tasks
  function getEnhancedTaskColor(t: any, end: Date, durationDays: number) {
    const today = new Date();
    const status = normalizeStatus(t.status);
    // Overdue: dueDate exists and is before today
    if (t.dueDate && new Date(t.dueDate) < today) return "red";
    // Long duration: duration > 30 days
    if (durationDays > 30) return "orange";
    if (t.flagged) return "red";
    if (status === "done") return "green";
    if (status === "in_progress") return "blue";
    if (status === "todo") return "gray";
    return "gray";
  }

  let sortedTasks = [...tasks];
  if (sortMode === "start") {
    sortedTasks.sort((a: any, b: any) => new Date(a.startDate || a.dueDate).getTime() - new Date(b.startDate || b.dueDate).getTime());
  } else if (sortMode === "due") {
    sortedTasks.sort((a: any, b: any) => new Date(a.dueDate || a.startDate).getTime() - new Date(b.dueDate || b.startDate).getTime());
  }
  const ganttTasks: Task[] = sortedTasks
    .map((t: any) => {
      // Determine duration in days
      let duration = t.duration;
      if (typeof duration !== "number" || duration <= 0) duration = 7;
      // Improved logic: prefer startDate if available
      let start: Date;
      let end: Date;

      if (t.startDate) {
        start = new Date(t.startDate);
        if (t.dueDate) {
          end = new Date(t.dueDate);
        } else {
          end = new Date(start);
          end.setDate(start.getDate() + duration);
        }
      } else {
        if (t.dueDate) {
          end = new Date(t.dueDate);
          start = new Date(end);
          start.setDate(end.getDate() - duration);
        } else {
          end = new Date();
          start = new Date();
          start.setDate(end.getDate() - duration);
        }
      }
      // Calculate durationDays for color logic
      const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const color = getEnhancedTaskColor(t, end, durationDays);
      const status = normalizeStatus(t.status);
      return {
        id: String(t.id),
        name: t.title,
        start,
        end,
        progress: status === "done" ? 100 : status === "in_progress" ? 50 : 0,
        dependencies: t.dependencyTaskId ? [String(t.dependencyTaskId)] : [],
        type: "task",
        styles: {
          progressColor: color,
          backgroundColor: color,
          backgroundSelectedColor: color
        }
      };
    });

  const GanttComponent = dynamic(() =>
    import("gantt-task-react").then((mod) => mod.Gantt)
  , { ssr: false });

  const handleDateChange = async (task: Task, children: Task[]) => {
    // Update the task dueDate and start date via PATCH
    const newDueDate = task.end.toISOString();
    const newStartDate = task.start.toISOString();
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDueDate, startDate: newStartDate }),
    });
    mutate();
  };

  const handleProgressChange = async (task: Task) => {
    // Convert progress to status and update
    let status = "todo";
    if (task.progress === 100) status = "done";
    else if (task.progress > 0) status = "in_progress";

    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutate();
  };

  function CustomTooltip({ task }: { task: Task }) {
    const durationDays = Math.round((task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return (
      <div className="p-2 bg-white border rounded shadow-md text-sm max-w-xs">
        <div><strong>{task.name}</strong></div>
        <div>Start: {task.start.toLocaleDateString()}</div>
        <div>End: {task.end.toLocaleDateString()}</div>
        <div>Duration: {durationDays} day{durationDays !== 1 ? 's' : ''}</div>
      </div>
    );
  }

  return (
    <Layout title="Gantt Chart">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Project #{projectId} Gantt Chart</h1>
        <a href={`/projects/${projectId}`} className="text-sm border px-3 py-1 rounded-md">
          Back to Project
        </a>
      </div>

      <div className="mb-4 flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            className={`px-3 py-1 rounded-md border ${viewMode === ViewMode.Day ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setViewMode(ViewMode.Day)}
          >
            Day
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${viewMode === ViewMode.Week ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setViewMode(ViewMode.Week)}
          >
            Week
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${viewMode === ViewMode.Month ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setViewMode(ViewMode.Month)}
          >
            Month
          </button>
        </div>

        <div className="flex space-x-2">
          <button
            className={`px-3 py-1 rounded-md border ${sortMode === "manual" ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setSortMode("manual")}
          >
            Default Sort
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${sortMode === "start" ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setSortMode("start")}
          >
            Start Date
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${sortMode === "due" ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setSortMode("due")}
          >
            Due Date
          </button>
        </div>
      </div>

      <div className="overflow-auto border rounded-md p-2">
  <GanttComponent
    tasks={ganttTasks}
    viewMode={viewMode}
    onDateChange={handleDateChange}
    onProgressChange={handleProgressChange}
    TooltipContent={CustomTooltip}
  />
</div>
    </Layout>
  );
}
