import { Dialog } from "@headlessui/react";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

interface ApplyTaskSetModalProps {
  open: boolean;
  onClose: () => void;
  taskSet: any | null;
}

export default function ApplyTaskSetModal({ open: isOpen, onClose, taskSet }: ApplyTaskSetModalProps) {
  // Defensive check: don't render modal if not open or no taskSet provided
  if (!isOpen) {
    // Modal is closed, do not render anything
    return null;
  }
  if (!taskSet) {
    console.warn("ApplyTaskSetModal: 'taskSet' prop is null or undefined while modal is open");
    return null;
  }

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [loading, setLoading] = useState(false); // Track loading state for submission
  const [loadingProjects, setLoadingProjects] = useState(false); // Track loading state for projects fetch
  const [fetchError, setFetchError] = useState<string | null>(null); // Track fetch error message
  const [showSuccess, setShowSuccess] = useState(false); // Track local success message display

  // Load all projects for the supervisor when modal opens
  useEffect(() => {
    if (typeof isOpen !== "boolean") {
      console.warn("ApplyTaskSetModal: 'isOpen' prop is not a boolean");
      return;
    }
    if (!isOpen) return;

    setLoadingProjects(true);
    setFetchError(null);

    fetch("/api/projects")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch projects");
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((project) => !project.isCompleted)
          : [];
        setProjects(list);
        setSelectedProject((prev) =>
          prev && list.some((project) => String(project.id) === prev) ? prev : ""
        );
      })
      .catch(() => {
        setFetchError("Failed to load projects. Please try again.");
        toast.error("Failed to load projects");
      })
      .finally(() => setLoadingProjects(false));
  }, [isOpen]);

  const parseJsonSafe = async (res: Response) => {
    const text = await res.text();
    if (!text) return {} as any;
    try { return JSON.parse(text); } catch { return {} as any; }
  };

  const handleApply = async () => {
    if (!selectedProject) {
      toast.error("Please select a project");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/tasksets/${taskSet.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: Number(selectedProject) }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || "Failed to apply task set";
        toast.error(msg);
        return;
      }

      toast.success("Task set successfully applied to the project!");
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1300);
    } catch (error: any) {
      console.error("Error applying task set:", error);
      const msg = error?.message || "An unexpected error occurred";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedProjectTitle = projects.find(p => String(p.id) === selectedProject)?.title || "";

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white p-6 rounded-lg max-w-sm w-full shadow-lg">
          <Dialog.Title className="text-lg font-semibold mb-4">
            Apply “{taskSet?.name || "Task Set"}” to Project
          </Dialog.Title>

          <label className="block mb-2 font-medium text-sm text-gray-700">
            Select Project
          </label>

          {/* Show loading, error, no projects, or project select dropdown */}
          {loadingProjects ? (
            <p className="mb-4 text-gray-500">Loading projects...</p>
          ) : fetchError ? (
            <p className="mb-4 text-red-600">{fetchError}</p>
          ) : projects.length === 0 ? (
            <p className="mb-4 text-gray-500">No projects available to select.</p>
          ) : (
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full border rounded p-2 mb-4"
              disabled={loading || showSuccess} // Disable select while submitting or showing success
            >
              <option value="">Select a project</option>
              {/* Safety guard: ensure projects is an array before mapping to prevent runtime errors if API returns non-array */}
              {Array.isArray(projects) &&
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
            </select>
          )}

          {showSuccess && (
            <p className="mb-4 text-green-600 font-semibold">
              ✅ Task Set successfully applied to {selectedProjectTitle}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              disabled={loading || showSuccess} // Disable cancel button while submitting or showing success to avoid conflicts
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || projects.length === 0 || showSuccess}
            >
              {loading ? "Applying..." : "Apply"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
