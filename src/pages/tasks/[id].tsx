import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { toast, Toaster } from "react-hot-toast";
import { useState, useEffect } from "react";
import StatusPill from "@/components/StatusPill";
import { useSession } from "next-auth/react";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { Loader2 } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";

const fetcher = (url: string) => fetch(url).then((r) => r.json());


function Breadcrumbs({ project, task }: { project?: any; task?: any }) {
  const router = useRouter();
  return (
    <nav className="text-sm mb-4" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2 text-gray-500">
        <li>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="hover:underline"
          >
            Dashboard
          </button>
        </li>
        <li>
          <span className="mx-1">/</span>
        </li>
        <li>
          {project ? (
            <button
              type="button"
              onClick={() => router.push(`/projects/${project.id}`)}
              className="hover:underline"
            >
              {project.title}
            </button>
          ) : (
            <span>Project</span>
          )}
        </li>
        <li>
          <span className="mx-1">/</span>
        </li>
        <li className="text-gray-900 font-medium">
          {task ? task.title : "Task"}
        </li>
      </ol>
    </nav>
  );
}


function formatDateTime(dt?: string) {
  if (!dt) return "N/A";
  const d = new Date(dt);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function TaskDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { data, error, mutate } = useSWR(
    id ? `/api/tasks/${id}` : null,
    fetcher
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusSelect, setStatusSelect] = useState("");
  const [showStatusInfo, setShowStatusInfo] = useState(false);

  useEffect(() => {
    if (data?.task?.status) {
      setStatusSelect(data.task.status.toLowerCase());
    }
  }, [data]);

  if (error)
    return (
      <Layout title="Task">
        <p>Error loading task.</p>
      </Layout>
    );
  if (!data)
    return (
      <Layout title="Task">
        <LoadingState
          title="Loading task details"
          message="We’re syncing the latest updates, collaborators, and timeline for this task."
          tone="brand"
        />
      </Layout>
    );

  const task = data.task;
  const project = data.project || task?.project || null;
  const assignedUsers = task?.assignedUsers || [];

  if (!task) {
    return (
      <Layout title="Task">
        <LoadingState
          title="Loading task details"
          message="We’re syncing the latest updates, collaborators, and timeline for this task."
          tone="brand"
        />
      </Layout>
    );
  }

  async function toggleComplete() {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "PUT" });
      if (!res.ok) throw new Error();
      toast.success("Task marked as complete!");
      mutate();
    } catch {
      toast.error("Failed to update task");
    }
  }

  function openEdit() {
    setEditForm({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      startDate: task.startDate ? task.startDate.slice(0, 10) : "",
      duration: typeof task.duration !== "undefined" && task.duration !== null ? task.duration : "",
      status: task.status,
      assignedUserIds: assignedUsers.map((u: any) => u.id),
    });
    setEditOpen(true);
  }

  async function handleEditSubmit(e: any) {
    e.preventDefault();
    setEditSaving(true);
    try {
      const start = editForm.startDate ? new Date(editForm.startDate) : null;
      const end = editForm.dueDate ? new Date(editForm.dueDate) : null;

      let duration = Number(editForm.duration);
      let adjustedDue = end;

      if (start && end) {
        const dayDiff = Math.ceil(
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (duration && duration !== dayDiff) {
          const confirmAdjust = window.confirm(
            "The entered duration doesn’t match the time between start and due date. Adjust dates to match this duration?"
          );
          if (confirmAdjust) {
            adjustedDue = new Date(start);
            adjustedDue.setDate(start.getDate() + duration);
          }
        } else {
          duration = dayDiff;
        }
      }

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          startDate: start ? start.toISOString() : null,
          dueDate: adjustedDue ? adjustedDue.toISOString() : null,
          duration,
        }),
      });

      if (!res.ok) throw new Error();
      toast.success("Task updated");
      setEditOpen(false);
      // Explicitly revalidate SWR for this task
      await mutate(`/api/tasks/${task.id}`);
    } catch {
      toast.error("Failed to update task");
    }
    setEditSaving(false);
  }

  // Placeholder: assigned users list
  function AssignedUsers({ users }: { users: any[] }) {
    if (!users?.length)
      return <span className="text-gray-500">Unassigned</span>;
    return (
      <ul className="space-y-1">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <span className="font-medium">{u.name}</span>
            <span className="text-xs text-gray-500">&lt;{u.email}&gt;</span>
          </li>
        ))}
      </ul>
    );
  }

  // Compose all project members into a single array for assignment
  const allUsers = project
    ? [
        ...(project.students || []),
        ...(project.collaborators || []),
        ...(project.supervisor ? [project.supervisor] : []),
      ]
    : assignedUsers;

  // Inline status update handler
  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value.toLowerCase();
    setStatusSelect(newStatus);
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      // Update the local task.status so StatusPill reflects immediately
      task.status = updated.status;
      toast.success("Status updated");
      setStatusSelect(updated.status.toLowerCase());
      await mutate();
    } catch {
      toast.error("Failed to update status");
      setStatusSelect(task.status.toLowerCase()); // revert selection in lowercase
    }
    setStatusUpdating(false);
  }

  return (
    <Layout title={task?.title || "Task"}>
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-md shadow">
        {/* Breadcrumb navigation */}
        <Breadcrumbs project={project} task={task} />

        {/* Enhanced task info */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{task?.title || "Untitled Task"}</h1>
            <div className="flex items-center gap-2">
              <StatusPill status={task?.status} />
              <select
                className="text-xs border rounded px-2 py-1 bg-gray-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 transition disabled:opacity-60"
                style={{ minWidth: 90 }}
                value={statusSelect}
                onChange={handleStatusChange}
                disabled={statusUpdating}
                aria-label="Change task status"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="behind_schedule">Behind Schedule</option>
                <option value="blocked">Blocked</option>
                <option value="review">Review</option>
                <option value="deferred">Deferred</option>
                <option value="done">Done</option>
              </select>
              <button
                onClick={() => setShowStatusInfo(true)}
                className="text-gray-400 hover:text-gray-600"
                title="View status descriptions"
              >
                <QuestionMarkCircleIcon className="w-5 h-5" />
              </button>
              {statusUpdating && (
                <span className="ml-1 text-xs text-gray-400 animate-pulse">
                  Saving...
                </span>
              )}
            </div>
          </div>
          <p className="text-gray-700">{task?.description || "No description available."}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">
              Assigned To
            </label>
            <AssignedUsers users={assignedUsers} />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">
              Due Date
            </label>
            <span>
              {task?.dueDate
                ? new Date(task.dueDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : "N/A"}
            </span>
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">
              Start Date
            </label>
            <span>
              {
                (() => {
                  // Fallback: ensure startDate is a string (ISO) if backend returns Date object
                  const normalizedStart = task?.startDate
                    ? (typeof task.startDate === "string"
                        ? task.startDate
                        : new Date(task.startDate).toISOString())
                    : null;
                  return normalizedStart
                    ? new Date(normalizedStart).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                    : "N/A";
                })()
              }
            </span>
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">
              Duration (days)
            </label>
            <span>
              {typeof task?.duration !== "undefined" && task?.duration !== null && task?.duration !== ""
                ? task.duration
                : "N/A"}
            </span>
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">
              Created
            </label>
            <span>{formatDateTime(task?.createdAt)}</span>
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-1">
              Last Updated
            </label>
            <span>{formatDateTime(task?.updatedAt)}</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={toggleComplete}
            className={`px-4 py-2 rounded-md transition ${
              task?.status === "done"
                ? "bg-gray-300 text-gray-700"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
            disabled={task?.status === "done"}
          >
            {task?.status === "done" ? "Completed" : "Mark as Completed"}
          </button>
          <button
            onClick={openEdit}
            className="px-4 py-2 rounded-md bg-blue-500 text-white hover:bg-blue-600 transition"
          >
            Edit Task
          </button>
          <button
            onClick={() => router.push(`/projects/${task?.projectId}/tasks`)}
            className="px-4 py-2 border rounded-md bg-white hover:bg-gray-50"
          >
            Back to Tasks
          </button>
        </div>

        {/* Comments section */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Comments</h2>
          <CommentsSection taskId={task?.id} />
        </div>

        {/* Edit Modal */}
        {editOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 relative">
              <h2 className="text-xl font-semibold mb-4">Edit Task</h2>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Title
                  </label>
                  <input
                    className="w-full border rounded px-2 py-1"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    className="w-full border rounded px-2 py-1"
                    rows={3}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-2 py-1"
                    value={editForm.startDate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, startDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-2 py-1"
                    value={editForm.dueDate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, dueDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Duration (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full border rounded px-2 py-1"
                    value={editForm.duration}
                    onChange={(e) =>
                      setEditForm({ ...editForm, duration: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Status
                  </label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Assign Users
                  </label>
                  <div className="border rounded px-2 py-2 space-y-2 max-h-40 overflow-y-auto">
                    {allUsers.length === 0 && (
                      <span className="text-gray-500 text-sm">
                        No users available.
                      </span>
                    )}
                    {allUsers.map((u: any) => {
                      const checked = editForm.assignedUserIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 cursor-pointer py-1"
                        >
                          <input
                            type="checkbox"
                            className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded"
                            checked={checked}
                            onChange={() => {
                              setEditForm((prev: any) => {
                                const ids = prev.assignedUserIds.includes(u.id)
                                  ? prev.assignedUserIds.filter(
                                      (id: any) => id !== u.id
                                    )
                                  : [...prev.assignedUserIds, u.id];
                                return { ...prev, assignedUserIds: ids };
                              });
                            }}
                          />
                          <span>
                            <span className="font-medium">{u.name}</span>{" "}
                            <span className="text-xs text-gray-500">
                              &lt;{u.email}&gt;
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                    onClick={() => setEditOpen(false)}
                    disabled={editSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                    disabled={editSaving}
                  >
                    {editSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {showStatusInfo && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
      <h2 className="text-lg font-semibold mb-4">Task Status Guide</h2>
      <ul className="space-y-2 text-sm">
        <li><span className="inline-block px-2 py-1 rounded bg-gray-200 text-gray-800 mr-2">To Do</span> Not started yet</li>
        <li><span className="inline-block px-2 py-1 rounded bg-blue-200 text-blue-800 mr-2">In Progress</span> Work has begun</li>
        <li><span className="inline-block px-2 py-1 rounded bg-orange-200 text-orange-800 mr-2">Behind Schedule</span> Missed due date, still active</li>
        <li><span className="inline-block px-2 py-1 rounded bg-red-200 text-red-800 mr-2">Blocked</span> Waiting on another task/input</li>
        <li><span className="inline-block px-2 py-1 rounded bg-purple-200 text-purple-800 mr-2">Review</span> Done but awaiting feedback</li>
        <li><span className="inline-block px-2 py-1 rounded bg-yellow-200 text-yellow-800 mr-2">Deferred</span> Paused or postponed</li>
        <li><span className="inline-block px-2 py-1 rounded bg-green-200 text-green-800 mr-2">Done</span> Fully completed</li>
      </ul>
      <div className="flex justify-end mt-4">
        <button
          onClick={() => setShowStatusInfo(false)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
        <Toaster position="bottom-right" />
      </div>
    </Layout>
  );
}
// CommentsSection component
import React from "react";

function CommentsSection({ taskId }: { taskId: string | number }) {
  // Fetch comments using SWR
  const {
    data: commentsData,
    error: commentsError,
    isLoading: commentsLoading,
    mutate: mutateComments,
  } = useSWR(taskId ? `/api/tasks/${taskId}/comments` : null, fetcher);

  const [commentContent, setCommentContent] = useState("");
  const [posting, setPosting] = useState(false);

  // New state for editing and deleting comments
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const { data: session } = useSession();

  function startEditing(id: number, content: string) {
    setEditingId(id);
    setEditingContent(content);
  }

  async function saveEdit(id: number) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: editingContent }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      toast.success("Comment updated");
      await mutateComments();
    } catch {
      toast.error("Failed to update comment");
    }
  }

  async function deleteComment(id: number) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Comment deleted");
      await mutateComments();
    } catch {
      toast.error("Failed to delete comment");
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent }),
      });
      if (!res.ok) throw new Error();
      setCommentContent("");
      await mutateComments();
      toast.success("Comment posted");
    } catch {
      toast.error("Failed to post comment");
    }
    setPosting(false);
  }

  return (
    <div className="bg-gray-50 border rounded p-4">
      {/* Loading/Error states */}
      {commentsLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-blue-900">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
          Loading comments…
        </div>
      )}
      {commentsError && (
        <div className="text-red-500 text-sm">Failed to load comments.</div>
      )}
      {/* Comments list */}
      {!commentsLoading && !commentsError && (
        <>
          {!Array.isArray(commentsData) && !commentsData?.comments?.length ? (
            <div className="text-gray-400 text-sm mb-4">No comments yet.</div>
          ) : (
            <ul className="space-y-4 mb-4">
              {(Array.isArray(commentsData)
                ? commentsData
                : commentsData?.comments
              )?.map((c: any) => (
                <li
                  key={c.id}
                  className="bg-white p-3 rounded shadow-sm border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-800">
                      {c.user?.name || "Unknown"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(c.createdAt)}
                    </span>
                  </div>
                  {/* Inline editing form or comment content */}
                  {editingId === c.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="w-full border rounded px-2 py-1 text-sm"
                        rows={2}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(c.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-700 whitespace-pre-wrap">
                      {c.content}
                    </div>
                  )}
                  {/* Edit/Delete buttons if not editing */}
                  {editingId !== c.id &&
                    Number((session?.user as any)?.id) === Number(c.user?.id) && (
                      <div className="flex gap-2 mt-1 text-xs">
                        <button
                          onClick={() => startEditing(c.id, c.content)}
                          className="text-blue-500 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
          )}
          {/* Add comment form */}
          <form onSubmit={addComment} className="flex flex-col gap-2">
            <textarea
              className="w-full border rounded px-2 py-1 resize-y"
              rows={2}
              placeholder="Write a comment..."
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              disabled={posting}
              required
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={posting || !commentContent.trim()}
              >
                {posting ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
