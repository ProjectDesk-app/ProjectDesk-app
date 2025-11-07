import Layout from "@/components/Layout";
import { ProjectLayout } from "@/components/ProjectLayout";
import { useRouter } from "next/router";
import type { NextRouter } from "next/router";
import useSWR, { type KeyedMutator } from "swr";
import { useMemo, useState } from "react";
import { toast, Toaster } from "react-hot-toast";
import TaskFormModal from "@/components/TaskFormModal";
import { useSession } from "next-auth/react";
import StatusPill from "@/components/StatusPill";
import { LoadingState } from "@/components/LoadingState";

type KanbanColumnKey = "todo" | "in_progress" | "done";

type KanbanColumn = {
  key: KanbanColumnKey;
  label: string;
  statuses: Set<string>;
};

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    key: "todo",
    label: "To Do",
    statuses: new Set(["TODO", "AT_RISK"]),
  },
  {
    key: "in_progress",
    label: "In Progress",
    statuses: new Set(["IN_PROGRESS", "BEHIND_SCHEDULE", "BLOCKED", "REVIEW", "DEFERRED"]),
  },
  {
    key: "done",
    label: "Done",
    statuses: new Set(["DONE", "COMPLETE"]),
  },
];

const ALL_KANBAN_STATUSES = new Set<string>();
KANBAN_COLUMNS.forEach((column) => column.statuses.forEach((status) => ALL_KANBAN_STATUSES.add(status)));

export default function ProjectTasks() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const myUserIdRaw = (session?.user as any)?.id;
  const myUserId = typeof myUserIdRaw === "number" ? myUserIdRaw : Number(myUserIdRaw);
  const canFilterByMine = !Number.isNaN(myUserId);

  const normalizeStatus = (status: unknown) =>
    typeof status === "string" ? status.toLowerCase() : String(status ?? "").toLowerCase();

  const [isModalOpen, setModalOpen] = useState(false);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  const describeAssignees = (task: any) => {
    if (!task?.assignedUsers?.length) return "Unassigned";
    return task.assignedUsers
      .map((user: any) => {
        const displayName = user.name || user.email || "Unnamed";
        return canFilterByMine && user.id === myUserId ? `${displayName} (You)` : displayName;
      })
      .join(", ");
  };

  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, mutate } = useSWR(
    projectId ? `/api/projects/${projectId}/tasks` : null,
    fetcher
  );
  const tasks = data?.tasks || [];

  const filteredTasks = useMemo(() => {
    if (!showMineOnly || !canFilterByMine) return tasks;
    return tasks.filter(
      (task: any) =>
        Array.isArray(task.assignedUsers) &&
        task.assignedUsers.some((user: any) => user.id === myUserId)
    );
  }, [tasks, showMineOnly, canFilterByMine, myUserId]);

  const activeTasks = filteredTasks.filter(
    (t: any) => normalizeStatus(t.status) !== "done"
  );
  const completedTasks = filteredTasks.filter(
    (t: any) => normalizeStatus(t.status) === "done"
  );

  if (!data) {
    return (
      <Layout title="Project Tasks">
        {projectId ? (
          <ProjectLayout projectId={projectId} title="Tasks">
            <LoadingState
              fullScreen={false}
              title="Loading project tasks"
              message="We’re syncing the latest activity and assignments for this project."
              tone="brand"
            />
          </ProjectLayout>
        ) : (
          <LoadingState
            title="Loading project tasks"
            message="We’re syncing the latest activity and assignments for this project."
            tone="brand"
          />
        )}
      </Layout>
    );
  }

  return (
    <Layout title="Project Tasks">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md shadow-sm transition"
        >
          ← Back to Dashboard
        </button>
        <ProjectLayout projectId={projectId as string} title="Tasks">
          <div className="p-6 text-gray-700">
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  onClick={() => setModalOpen(true)}
                >
                  + New Task
                </button>
                <div className="flex items-center gap-3">
                  {canFilterByMine && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300"
                        checked={showMineOnly}
                        onChange={(e) => setShowMineOnly(e.target.checked)}
                      />
                      <span>Show only my assigned tasks</span>
                    </label>
                  )}
                  <div className="inline-flex rounded-md border border-gray-200 bg-white text-sm font-medium shadow-sm">
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-l-md ${
                        viewMode === "list"
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      onClick={() => setViewMode("list")}
                    >
                      List View
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-r-md ${
                        viewMode === "kanban"
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      onClick={() => setViewMode("kanban")}
                    >
                      Kanban View
                    </button>
                  </div>
                </div>
              </div>

              <TaskFormModal
                projectId={projectId}
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
                mutate={mutate}
              />

              {viewMode === "list" ? (
                <>
                  {/* Active Tasks */}
                  <h2 className="text-lg font-semibold mb-2">Active Tasks ({activeTasks.length})</h2>
                  <ul className="space-y-3 mb-8">
                    {activeTasks.length === 0 && (
                      <p className="text-sm text-gray-500">No active tasks.</p>
                    )}
                    {activeTasks.map((task: any) => (
                      <li
                        key={task.id}
                        className={`border p-4 rounded-md flex justify-between items-center bg-white transition ${
                          task.flagged ? "border-red-500 bg-red-50" : "border-gray-200"
                        }`}
                      >
                        <div className="flex-1 cursor-pointer" onClick={() => router.push(`/tasks/${task.id}`)}>
                          <p className="font-medium text-gray-900">{task.title}</p>
                          <p className="text-sm text-gray-500">{task.description}</p>
                          <p className="text-xs text-gray-500 mt-2">
                            <span className="font-semibold text-gray-600">Assignees:</span>{" "}
                            {describeAssignees(task)}
                          </p>
                          <p
                            className={`text-xs ${
                              task.dueDate &&
                              new Date(task.dueDate) < new Date() &&
                              normalizeStatus(task.status) !== "done"
                                ? "text-red-600 font-semibold"
                                : "text-gray-400"
                            }`}
                          >
                            Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "N/A"}
                          </p>
                          {task.dueDate &&
                            new Date(task.dueDate) < new Date() &&
                            normalizeStatus(task.status) !== "done" && (
                              <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded mt-1">
                                ⚠ Overdue
                              </span>
                            )}
                        </div>

                        <div className="flex justify-center items-center w-32">
                          <StatusPill status={task.status} />
                        </div>

                        <div className="flex flex-col items-end space-y-2 text-sm">
                          <button
                            className={`${
                              task.flagged ? "text-gray-600 hover:text-gray-800" : "text-red-600 hover:text-red-800"
                            }`}
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/tasks/${task.id}/flag`, { method: "POST" });
                                if (!res.ok) throw new Error("Failed to flag task");
                                toast.success(task.flagged ? "Task unflagged." : "Task flagged!");
                                mutate();
                              } catch (err) {
                                console.error(err);
                                toast.error("Error flagging task");
                              }
                            }}
                          >
                            {task.flagged ? "Unflag" : "🚩 Flag"}
                          </button>
                          {userRole === "SUPERVISOR" && (
                            <button
                              onClick={async () => {
                                if (!confirm("Are you sure you want to delete this task?")) return;
                                try {
                                  const res = await fetch(`/api/tasks/${task.id}`, {
                                    method: "DELETE",
                                  });
                                  if (!res.ok) throw new Error("Failed to delete task");
                                  toast.success("Task deleted successfully");
                                  mutate();
                                } catch (err) {
                                  console.error(err);
                                  toast.error("Error deleting task");
                                }
                              }}
                              className="text-gray-500 hover:text-red-600 transition"
                              title="Delete Task"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Completed Tasks */}
                  <h2 className="text-lg font-semibold mb-2">
                    ✅ Completed Tasks ({completedTasks.length})
                  </h2>
                  {completedTasks.length === 0 ? (
                    <p className="text-sm text-gray-500">No completed tasks yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {completedTasks.map((task: any) => (
                        <li
                          key={task.id}
                          className="border p-4 rounded-md bg-gray-100 text-gray-600 flex justify-between items-center"
                        >
                          <div onClick={() => router.push(`/tasks/${task.id}`)} className="cursor-pointer">
                            <p className="font-medium line-through">{task.title}</p>
                            <p className="text-xs">Completed</p>
                            <p className="text-xs text-gray-500 mt-1">
                              <span className="font-semibold text-gray-600">Assignees:</span>{" "}
                              {describeAssignees(task)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end space-y-2 text-sm">
                            <StatusPill status={task.status} />
                            <button
                              className={`${
                                task.flagged ? "text-gray-600 hover:text-gray-800" : "text-red-600 hover:text-red-800"
                              }`}
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/tasks/${task.id}/flag`, { method: "POST" });
                                  if (!res.ok) throw new Error("Failed to flag task");
                                  toast.success(task.flagged ? "Task unflagged." : "Task flagged!");
                                  mutate();
                                } catch (err) {
                                  console.error(err);
                                  toast.error("Error flagging task");
                                }
                              }}
                            >
                              {task.flagged ? "Unflag" : "🚩 Flag"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <KanbanView
                  tasks={filteredTasks}
                  describeAssignees={describeAssignees}
                  router={router}
                  mutate={mutate}
                  userRole={userRole}
                />
              )}
            </>
          </div>
        </ProjectLayout>
      </div>
      <Toaster position="bottom-right" />
    </Layout>
  );
}

type KanbanViewProps = {
  tasks: any[];
  describeAssignees: (task: any) => string;
  router: NextRouter;
  mutate: KeyedMutator<any>;
  userRole: string | undefined;
};

function KanbanView({ tasks, describeAssignees, router, mutate, userRole }: KanbanViewProps) {
  const navigateToTask = (taskId: number) => {
    router.push(`/tasks/${taskId}`);
  };

  const toggleFlag = async (task: any) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/flag`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to flag task");
      toast.success(task.flagged ? "Task unflagged." : "Task flagged!");
      mutate();
    } catch (error) {
      console.error(error);
      toast.error("Error flagging task");
    }
  };

  const deleteTask = async (task: any) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
      toast.success("Task deleted successfully");
      mutate();
    } catch (error) {
      console.error(error);
      toast.error("Error deleting task");
    }
  };

  const renderCard = (task: any) => {
    const overdue =
      task.dueDate && new Date(task.dueDate) < new Date() && (task.status || "").toUpperCase() !== "DONE";

    return (
      <div
        key={task.id}
        className={`rounded-lg border p-4 shadow-sm ${
          task.flagged ? "border-red-500 bg-red-50" : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="cursor-pointer" onClick={() => navigateToTask(task.id)}>
            <p className="font-semibold text-gray-900">{task.title}</p>
            <p className="text-xs text-gray-500">{describeAssignees(task)}</p>
          </div>
          <StatusPill status={task.status} />
        </div>
        {task.description && <p className="mt-2 text-sm text-gray-600">{task.description}</p>}
        <p className="mt-2 text-xs text-gray-500">
          Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "N/A"}
        </p>
        {overdue && (
          <span className="mt-1 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            ⚠ Overdue
          </span>
        )}
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            className={`${task.flagged ? "text-gray-600 hover:text-gray-800" : "text-red-600 hover:text-red-800"}`}
            onClick={() => toggleFlag(task)}
          >
            {task.flagged ? "Unflag" : "🚩 Flag"}
          </button>
          {userRole === "SUPERVISOR" && (
            <button className="text-gray-500 hover:text-red-600" onClick={() => deleteTask(task)}>
              🗑️
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      {KANBAN_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task: any) => {
          const status = (task.status || "").toUpperCase();
          if (column.statuses.has(status)) return true;
          if (!ALL_KANBAN_STATUSES.has(status) && column.key === "todo") return true;
          return false;
        });

        return (
          <div key={column.key} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase text-gray-600">{column.label}</h3>
              <span className="text-xs text-gray-500">{columnTasks.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {columnTasks.length === 0 ? (
                <p className="text-xs text-gray-400">No tasks here.</p>
              ) : (
                columnTasks.map((task: any) => renderCard(task))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
