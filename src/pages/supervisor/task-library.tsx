import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import Layout from "@/components/Layout";
import TaskSetModal from "@/components/TaskSetModal";
import ApplyTaskSetModal from "@/components/ApplyTaskSetModal";
import useSWR from "swr";
import { Layers } from "lucide-react";

export default function TaskLibrary() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showTaskSetModal, setShowTaskSetModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedTaskSet, setSelectedTaskSet] = useState<any | null>(null);
  // State to track which Task Set is being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  // State to track the temporary name during editing
  const [editName, setEditName] = useState<string>("");
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, mutate } = useSWR("/api/tasksets", fetcher);
  const taskSets = Array.isArray(data) ? data : data?.taskSets || [];

  const userRole = (session?.user as any)?.role;

  // Supervisor/Admin access check
  if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN")) {
    return (
      <Layout title="Access Denied">
        <p className="p-6 text-red-600">Access denied.</p>
      </Layout>
    );
  }

  // Function to handle saving the renamed Task Set
  const saveRename = async (id: string) => {
    if (!editName.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    try {
      const res = await fetch(`/api/tasksets/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        throw new Error("Failed to update Task Set name.");
      }
      toast.success("Task Set renamed successfully.");
      setEditingId(null);
      setEditName("");
      mutate(); // Refresh the list
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Layout title="Task Library">
      <div className="max-w-5xl mx-auto p-6 space-y-6 text-gray-700">
        {/* Page intro */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Layers className="h-6 w-6 text-gray-800" />
            <span>Task Library</span>
          </h1>
          <p className="mt-2 text-sm text-blue-900">
            Create a template set of tasks that can be re-used on multiple projects.
            <br />E.g. create a Task Set for an <em>Undergraduate Quantitative Project</em>, which would differ to a <em>Postgraduate Qualitative Project</em> Task Set.
          </p>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Your Task Sets</h2>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            onClick={() => setShowTaskSetModal(true)}
          >
            + Create New Task Set
          </button>
        </div>

        {/* Task set list */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          {!data && !error ? (
            <p>Loading...</p>
          ) : error ? (
            <p>Could not load task sets.</p>
          ) : taskSets.length === 0 ? (
            <p>No task sets yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {taskSets.map((ts: any) => (
                <li key={ts.id} className="flex justify-between items-center py-4">
                  <div className="flex items-center gap-3">
                    {editingId === ts.id ? (
                      <>
                        {/* Inline input field for renaming */}
                        <input
                          type="text"
                          className="border rounded px-2 py-1 text-gray-700"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                        {/* Save button */}
                        <button
                          className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition text-sm"
                          onClick={() => saveRename(ts.id)}
                        >
                          Save
                        </button>
                        {/* Cancel button */}
                        <button
                          className="bg-gray-300 text-gray-800 px-3 py-1 rounded hover:bg-gray-400 transition text-sm"
                          onClick={() => {
                            setEditingId(null);
                            setEditName("");
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          {/* Pencil icon to trigger renaming */}
                          <button
                            className="text-gray-500 hover:text-gray-700 transition flex items-center"
                            aria-label={`Rename ${ts.name}`}
                            onClick={() => {
                              setEditingId(ts.id);
                              setEditName(ts.name);
                            }}
                            type="button"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="w-5 h-5"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.862 3.487a2.125 2.125 0 012.998 2.998L7.5 18.846l-4 1 1-4 12.362-12.359z"
                              />
                            </svg>
                          </button>
                          {/* Display Task Set name */}
                          <span className="font-semibold">{ts.name}</span>
                          {/* Number of tasks */}
                          <span className="ml-2 text-sm text-gray-600">{ts.templates?.length || 0} tasks</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="bg-gray-100 text-gray-800 px-4 py-2 rounded hover:bg-gray-200 transition text-sm"
                      onClick={() => router.push(`/supervisor/task-sets/${ts.id}`)}
                    >
                      View &amp; Edit
                    </button>
                    <button
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                      onClick={() => {
                        setSelectedTaskSet(ts);
                        setShowApplyModal(true);
                      }}
                    >
                      Apply to Project
                    </button>
                    <button
                      className="bg-gray-100 text-gray-800 px-4 py-2 rounded hover:bg-gray-200 transition text-sm"
                      onClick={async () => {
                        if (confirm(`Duplicate "${ts.name}"?`)) {
                          try {
                            const res = await fetch(`/api/tasksets/${ts.id}/duplicate`, { method: "POST" });
                            if (!res.ok) throw new Error("Failed to duplicate Task Set");
                            toast.success("Task Set duplicated successfully.");
                            mutate();
                          } catch (error) {
                            toast.error("Failed to duplicate Task Set.");
                          }
                        }
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition text-sm"
                      onClick={async () => {
                        if (confirm(`Are you sure you want to delete "${ts.name}"?`)) {
                          try {
                            const res = await fetch(`/api/tasksets/${ts.id}`, { method: "DELETE" });
                            if (!res.ok) throw new Error("Failed to delete task set");

                            // ✅ Refresh data first
                            await mutate();

                            // ✅ Then show toast (after component re-render)
                            toast.success("Task Set deleted successfully.");
                          } catch (error) {
                            toast.error("Error deleting Task Set.");
                          }
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Modals */}
        <TaskSetModal
          isOpen={showTaskSetModal}
          onClose={() => setShowTaskSetModal(false)}
          mutate={mutate}
          onCreated={() => {
            setShowTaskSetModal(false);
            mutate();
          }}
        />
        {/* Use `open` prop to correctly pass a boolean to the modal dialog */}
        <ApplyTaskSetModal
          open={showApplyModal}
          taskSet={selectedTaskSet}
          onClose={() => {
            setShowApplyModal(false);
            setSelectedTaskSet(null);
            mutate();
          }}
        />
      </div>
    </Layout>
  );
}
