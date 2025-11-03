import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { ProjectLayout } from "@/components/ProjectLayout";
import { toast, Toaster } from "react-hot-toast";
import { useMemo, useState } from "react";
import { LoadingState } from "@/components/LoadingState";

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

export default function ProjectOverview() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { data: project, error, mutate } = useSWR(
    projectId ? `/api/projects/${projectId}` : null,
    fetcher
  );

  const [pendingTasks, setPendingTasks] = useState<PendingTask[] | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isForceCompleting, setIsForceCompleting] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isSendingUpdate, setIsSendingUpdate] = useState(false);

  const formatTaskStatus = (status: string) =>
    status
      ? status
          .toString()
          .split("_")
          .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
          .join(" ")
      : "Unknown";

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
    if (!projectId) return;
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
    if (!projectId) return;
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
          <section className="space-y-6">
            {/* Status */}
            <div className="flex items-center space-x-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${statusClass}`}
              >
                {statusLabel}
              </span>
              <span className="text-gray-600 text-sm">Project Status</span>
            </div>

            {/* Progress timeline */}
            {project.startDate && project.endDate && (
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>
                    {new Date(project.startDate).toLocaleDateString()}
                  </span>
                  <span>{new Date(project.endDate).toLocaleDateString()}</span>
                </div>
                <div className="relative h-3 bg-gray-200 rounded-full">
                  <div
                    className="absolute top-0 left-0 h-3 bg-blue-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  ></div>
                  <div
                    className="absolute top-0 h-3 w-1 bg-black"
                    style={{
                      left: `${progress}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Description</h3>
              <p className="text-gray-600">
                {project.description || "No description provided."}
              </p>
            </div>

            {/* People */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">👥 Team</h3>
              <ul className="text-gray-700 space-y-1">
                <li>
                  <strong>Supervisor:</strong> {project.supervisor?.name}{" "}
                  <a
                    href={`mailto:${project.supervisor?.email}`}
                    className="text-blue-500"
                  >
                    ✉️
                  </a>
                </li>
                {project.students?.length > 0 && (
                  <li>
                    <strong>Student(s):</strong>{" "}
                    {project.students.map((s: any) => (
                      <span key={s.id}>
                        {s.name}{" "}
                        <a href={`mailto:${s.email}`} className="text-blue-500">
                          ✉️
                        </a>{" "}
                      </span>
                    ))}
                  </li>
                )}
                {project.collaborators?.length > 0 && (
                  <li>
                    <strong>Collaborator(s):</strong>{" "}
                    {project.collaborators.map((c: any) => (
                      <span key={c.id}>
                        {c.name}{" "}
                        <a href={`mailto:${c.email}`} className="text-blue-500">
                          ✉️
                        </a>{" "}
                      </span>
                    ))}
                  </li>
                )}
              </ul>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-4">
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                onClick={() => router.push(`/projects/${resolvedProjectId}/edit`)}
              >
                Edit Project
              </button>
              <button
                className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
                onClick={openUpdateModal}
              >
                Request Update
              </button>
              {project.isCompleted ? (
                <button
                  className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={reactivateProject}
                  disabled={isReactivating}
                >
                  {isReactivating ? "Reactivating..." : "Reactivate Project"}
                </button>
              ) : (
                <button
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={attemptProjectCompletion}
                  disabled={isCompleting}
                >
                  {isCompleting ? "Marking..." : "Mark as Completed"}
                </button>
              )}
            </div>
          </section>
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
