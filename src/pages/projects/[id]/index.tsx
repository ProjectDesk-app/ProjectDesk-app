import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { ProjectLayout } from "@/components/ProjectLayout";
import { toast, Toaster } from "react-hot-toast";
import { useMemo, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { getProjectLeadLabel } from "@/lib/projectLabels";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

type PendingTask = {
  id: number;
  title: string;
  status: string;
};

type TeamMember = {
  id: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Only allow project IDs that are positive integers
function isValidProjectId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const num = Number(id);
  return !isNaN(num) && Number.isInteger(num) && num > 0;
}

export default function ProjectOverview() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { data: project, error, mutate } = useSWR(
    projectId ? `/api/projects/${projectId}` : null,
    fetcher
  );
  const { data: tasksData } = useSWR(
    projectId ? `/api/projects/${projectId}/tasks` : null,
    fetcher
  );

  const [pendingTasks, setPendingTasks] = useState<PendingTask[] | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isForceCompleting, setIsForceCompleting] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isSendingUpdate, setIsSendingUpdate] = useState(false);
  const [showStatusInfo, setShowStatusInfo] = useState(false);

  const formatTaskStatus = (status: string) =>
    status
      ? status
          .toString()
          .split("_")
          .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
          .join(" ")
      : "Unknown";

  const normalizeTaskStatus = (status: unknown) =>
    typeof status === "string" ? status.toLowerCase() : String(status ?? "").toLowerCase();

  const formatShortDate = (value?: string | null) => {
    if (!value) return "Not set";
    return new Date(value).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const pluralize = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

  const teamMembers: TeamMember[] = useMemo(() => {
    if (!project) return [];
    const members: TeamMember[] = [
      ...(project.students || []),
      ...(project.collaborators || []),
    ];
    const unique = new Map<number, TeamMember>();
    for (const member of members) {
      if (member && typeof member.id === "number") {
        unique.set(member.id, member);
      }
    }
    return Array.from(unique.values());
  }, [project]);

  const attemptProjectCompletion = async () => {
    if (!projectId) return;
    if (!confirm("Mark this project as completed?")) return;
    setIsCompleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/complete`, {
        method: "PUT",
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch (parseError) {
        payload = null;
      }

      if (res.ok) {
        toast.success("Project marked as completed!");
        router.push("/dashboard");
        return;
      }

      if (res.status === 409 && payload?.code === "INCOMPLETE_TASKS") {
        const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
        if (tasks.length > 0) {
          setPendingTasks(tasks);
        } else {
          toast.error(
            payload?.error || "Cannot complete project while tasks remain open."
          );
        }
        return;
      }

      throw new Error(payload?.error || "Failed to complete project");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not mark project as completed"
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const forceCompleteProject = async () => {
    if (!projectId) return;
    setIsForceCompleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceComplete: true }),
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch (parseError) {
        payload = null;
      }

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to complete project");
      }

      toast.success(
        "All outstanding tasks marked complete and project completed!"
      );
      setPendingTasks(null);
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not force complete project"
      );
    } finally {
      setIsForceCompleting(false);
    }
  };

  const dismissWarning = () => setPendingTasks(null);

  const openUpdateModal = () => {
    if (teamMembers.length === 0) {
      toast.error("No team members available for this project.");
      return;
    }
    setSelectedRecipients(teamMembers.map((member) => String(member.id)));
    setShowUpdateModal(true);
  };

  const toggleRecipient = (memberId: number) => {
    setSelectedRecipients((prev) => {
      const id = String(memberId);
      return prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id];
    });
  };

  const sendUpdateRequest = async () => {
    if (!isValidProjectId(projectId)) {
      toast.error("Invalid project ID.");
      return;
    }
    if (selectedRecipients.length === 0) {
      toast.error("Select at least one team member.");
      return;
    }
    setIsSendingUpdate(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/request-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientIds: selectedRecipients.map((value) => Number(value)),
        }),
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to send update request");
      }

      toast.success("Update request sent!");
      setShowUpdateModal(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not send update request"
      );
    } finally {
      setIsSendingUpdate(false);
    }
  };

  const reactivateProject = async () => {
    if (!projectId || !isValidProjectId(projectId)) {
      toast.error("Invalid project ID.");
      return;
    }
    if (!confirm("Reactivate this project?")) return;
    setIsReactivating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reactivate`, {
        method: "PUT",
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to reactivate project");
      }

      toast.success("Project reactivated!");
      setPendingTasks(null);
      await mutate();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not reactivate project"
      );
    } finally {
      setIsReactivating(false);
    }
  };

  if (error)
    return <Layout title="Project">Failed to load project.</Layout>;
  if (!project)
    return (
      <Layout title="Project Overview">
        <LoadingState
          title="Loading project overview"
          message="We’re gathering the latest updates, milestones, and team activity."
          tone="brand"
        />
      </Layout>
    );

  const leadLabel = getProjectLeadLabel(project.category);

  const statusLabel = project.isCompleted
    ? "Completed"
    : project.status || "Unknown";

  const statusClass = project.isCompleted
    ? "bg-green-200 text-green-800"
    : project.status === "On Track"
    ? "bg-green-100 text-green-800"
    : project.status === "At Risk"
    ? "bg-yellow-100 text-yellow-800"
    : project.status === "Danger"
    ? "bg-orange-100 text-orange-800"
    : "bg-red-100 text-red-800";

  // Compute timeline progress
  const progress =
    project.startDate && project.endDate
      ? Math.min(
          100,
          Math.max(
            0,
            ((new Date().getTime() - new Date(project.startDate).getTime()) /
              (new Date(project.endDate).getTime() -
                new Date(project.startDate).getTime())) *
              100
          )
        )
      : 0;

  const resolvedProjectId = projectId ?? String(project.id);
  const projectTasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
  const totalTasks = projectTasks.length;
  const completedTasksCount = projectTasks.filter((task: any) => {
    const status = normalizeTaskStatus(task.status);
    return status === "done" || status === "complete" || status === "completed";
  }).length;
  const tasksProgressPercent =
    totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;
  const tasksLoading = Boolean(projectId && !tasksData);

  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const projectEndDate = project.endDate ? new Date(project.endDate) : null;

  const overdueTasks = projectTasks.filter((task: any) => {
    if (!task.dueDate) return false;
    const dueTime = new Date(task.dueDate).getTime();
    return (
      dueTime < now.getTime() - oneDayMs &&
      !["done", "completed", "complete"].includes(
        normalizeTaskStatus(task.status)
      )
    );
  });

  const behindScheduleTasks = projectTasks.filter((task: any) => {
    if (!task.dueDate) return false;
    const dueTime = new Date(task.dueDate).getTime();
    const status = normalizeTaskStatus(task.status);
    return (
      dueTime < now.getTime() &&
      ["behind_schedule", "not_started", "to_do", "todo", "in_progress"].includes(
        status
      )
    );
  });

  const durationOverflow = projectTasks.filter((task: any) => {
    if (!task.startDate || !projectEndDate) return false;
    if (typeof task.duration !== "number" || task.duration <= 0) return false;
    return (
      new Date(task.startDate).getTime() + task.duration * oneDayMs >
      projectEndDate.getTime()
    );
  });

  const tasksBeyondProject = projectTasks.filter((task: any) => {
    if (!task.dueDate || !projectEndDate) return false;
    return new Date(task.dueDate).getTime() > projectEndDate.getTime();
  });

  const overdueCount = overdueTasks.length;
  const behindScheduleCount = behindScheduleTasks.length;
  const durationOverflowCount = durationOverflow.length;
  const beyondProjectCount = tasksBeyondProject.length;

  const statusDetails = useMemo(
    () => [
      {
        label: "Not Started",
        description: "Triggered when the project has no tasks yet.",
        current:
          totalTasks === 0
            ? "Currently true — add your first task to begin tracking."
            : undefined,
      },
      {
        label: "On Track",
        description:
          "Default state when there are no overdue tasks or schedule risks.",
        current:
          project.status === "On Track"
            ? "Currently selected status."
            : undefined,
      },
      {
        label: "Behind Schedule",
        description:
          "Triggered when any task is overdue by more than one day while still active.",
        current: overdueCount
          ? `${pluralize(overdueCount, "task")} overdue by more than one day.`
          : undefined,
      },
      {
        label: "At Risk",
        description:
          "Triggered when exactly one task has passed its due date and is still active.",
        current:
          behindScheduleCount === 1
            ? "Currently 1 task past due."
            : undefined,
      },
      {
        label: "Danger",
        description:
          "Triggered when two or more tasks are past due, or when any task extends beyond the project end date.",
        current:
          behindScheduleCount >= 2 ||
          durationOverflowCount > 0 ||
          beyondProjectCount > 0
            ? [
                behindScheduleCount >= 2
                  ? `${pluralize(behindScheduleCount, "task")} past due`
                  : null,
                durationOverflowCount > 0
                  ? `${pluralize(
                      durationOverflowCount,
                      "task"
                    )} exceed planned duration`
                  : null,
                beyondProjectCount > 0
                  ? `${pluralize(
                      beyondProjectCount,
                      "task"
                    )} finish after the project end date`
                  : null,
              ]
                .filter(Boolean)
                .join(" • ")
            : undefined,
      },
      {
        label: "Completed",
        description: "Triggered when every task is marked done or complete.",
        current:
          totalTasks > 0 && completedTasksCount === totalTasks
            ? "All tasks complete."
            : undefined,
      },
    ],
    [
      totalTasks,
      completedTasksCount,
      overdueCount,
      behindScheduleCount,
      durationOverflowCount,
      beyondProjectCount,
      project.status,
    ]
  );

  return (
    <Layout title={`Project: ${project.title}`}>
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md shadow-sm transition"
        >
          ← Back to Dashboard
        </button>
        <ProjectLayout
          projectId={resolvedProjectId}
          title={project.title}
          category={project.category}
        >
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Project status
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowStatusInfo(true)}
                          className="text-gray-400 transition hover:text-gray-600"
                          aria-label="View project status rules"
                        >
                          <QuestionMarkCircleIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p className="font-semibold text-gray-900">
                        {leadLabel}: {project.supervisor?.name || "Unassigned"}
                      </p>
                      {project.supervisor?.email && (
                        <a
                          href={`mailto:${project.supervisor.email}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {project.supervisor.email}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-gray-900">
                        Project timeline
                      </p>
                      <span className="text-xs text-gray-500">
                        {project.startDate && project.endDate
                          ? `${Math.round(progress)}% elapsed`
                          : "Add start & end dates"}
                      </span>
                    </div>
                    {project.startDate && project.endDate ? (
                      <>
                        <div className="mt-3 h-2 rounded-full bg-white">
                          <div
                            className="h-2 rounded-full bg-blue-600"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-gray-600">
                          <span>
                            Start date: {formatShortDate(project.startDate)}
                          </span>
                          <span>
                            End date: {formatShortDate(project.endDate)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-xs text-gray-600">
                        Set start and end dates to track how far through the
                        project you are.
                      </p>
                    )}
                  </div>

                  <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-gray-900">
                        Task completion
                      </p>
                      <span className="text-xs text-gray-500">
                        {tasksLoading
                          ? "Syncing tasks…"
                          : totalTasks > 0
                          ? `${completedTasksCount} of ${totalTasks} tasks`
                          : "No tasks yet"}
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${tasksProgressPercent}%` }}
                      />
                    </div>
                    {!tasksLoading && (
                      <p className="mt-2 text-xs text-gray-600">
                        {totalTasks > 0
                          ? `${tasksProgressPercent}% complete`
                          : "Create your first task to start tracking progress."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Project summary
                    </h3>
                    {project.category && (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-blue-700">
                        {project.category}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-gray-700 whitespace-pre-line">
                    {project.description || "No description provided."}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Team members
                  </h3>
                  <ul className="mt-4 space-y-3 text-sm text-gray-700">
                    <li>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        {leadLabel}
                      </p>
                      <p className="font-medium text-gray-900">
                        {project.supervisor?.name || "Unassigned"}
                      </p>
                      {project.supervisor?.email && (
                        <a
                          href={`mailto:${project.supervisor.email}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {project.supervisor.email}
                        </a>
                      )}
                    </li>
                    <li>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Students
                      </p>
                      {project.students?.length ? (
                        <ul className="mt-1 space-y-1">
                          {project.students.map((student: any) => (
                            <li key={student.id}>
                              <span className="font-medium">
                                {student.name || student.email}
                              </span>
                              {student.email && (
                                <>
                                  {" "}
                                  <a
                                    href={`mailto:${student.email}`}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    {student.email}
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500">
                          No students assigned yet.
                        </p>
                      )}
                    </li>
                    <li>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Collaborators
                      </p>
                      {project.collaborators?.length ? (
                        <ul className="mt-1 space-y-1">
                          {project.collaborators.map((collaborator: any) => (
                            <li key={collaborator.id}>
                              <span className="font-medium">
                                {collaborator.name || collaborator.email}
                              </span>
                              {collaborator.email && (
                                <>
                                  {" "}
                                  <a
                                    href={`mailto:${collaborator.email}`}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    {collaborator.email}
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500">
                          No collaborators added.
                        </p>
                      )}
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Project actions
                  </h3>
                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                      onClick={() =>
                        router.push(`/projects/${resolvedProjectId}/edit`)
                      }
                    >
                      Edit project
                    </button>
                    <button
                      className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
                      onClick={openUpdateModal}
                    >
                      Request update
                    </button>
                    {project.isCompleted ? (
                      <button
                        className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-yellow-600 disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={reactivateProject}
                        disabled={isReactivating}
                      >
                        {isReactivating ? "Reactivating..." : "Reactivate project"}
                      </button>
                    ) : (
                      <button
                        className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={attemptProjectCompletion}
                        disabled={isCompleting}
                      >
                        {isCompleting ? "Marking..." : "Mark as completed"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ProjectLayout>
      </div>
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Request Progress Update
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Select the team members who should receive this update request.
            </p>
            <div className="mb-4 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
              {teamMembers.map((member) => {
                const id = String(member.id);
                return (
                  <label
                    key={member.id}
                    className="flex items-start gap-3 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedRecipients.includes(id)}
                      onChange={() => toggleRecipient(member.id)}
                      disabled={isSendingUpdate}
                    />
                    <span>
                      <span className="font-medium text-gray-900">
                        {member.name || member.email || "Unnamed member"}
                      </span>
                      {member.email && (
                        <span className="block text-xs text-gray-500">
                          {member.email}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {teamMembers.length === 0 && (
                <p className="text-sm text-gray-500">
                  No team members available for this project.
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end sm:space-x-3 gap-3">
              <button
                className="w-full sm:w-auto rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => setShowUpdateModal(false)}
                disabled={isSendingUpdate}
              >
                Cancel
              </button>
              <button
                className="w-full sm:w-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={sendUpdateRequest}
                disabled={isSendingUpdate}
              >
                {isSendingUpdate ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showStatusInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Project status guide
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              These rules match the automated logic that updates project status.
            </p>
            <ul className="mt-4 space-y-4 text-sm text-gray-700">
              {statusDetails.map((entry) => (
                <li key={entry.label}>
                  <p className="font-semibold text-gray-900">{entry.label}</p>
                  <p className="text-gray-600">{entry.description}</p>
                  {entry.current && (
                    <p className="mt-1 text-xs text-blue-600">{entry.current}</p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowStatusInfo(false)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingTasks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Outstanding Tasks Detected
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This project still has {pendingTasks.length} open
              {pendingTasks.length === 1 ? " task" : " tasks"}. You can mark
              them all as complete and finish the project, or cancel and review
              the tasks manually.
            </p>
            <ul className="mb-4 max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-2">
              {pendingTasks.map((task) => (
                <li key={task.id}>
                  <span className="font-medium text-gray-900">{task.title}</span>{" "}
                  <span className="text-xs tracking-wide text-gray-500">
                    ({formatTaskStatus(task.status)})
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row sm:justify-end sm:space-x-3 gap-3">
              <button
                className="w-full sm:w-auto rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={dismissWarning}
                disabled={isForceCompleting}
              >
                Cancel
              </button>
              <button
                className="w-full sm:w-auto rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={forceCompleteProject}
                disabled={isForceCompleting}
              >
                {isForceCompleting
                  ? "Completing..."
                  : "Mark Tasks Complete & Finish Project"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster position="bottom-right" />
    </Layout>
  );
}
