import { useRouter } from "next/router";
import useSWR from "swr";
import { useState } from "react";
import Layout from "@/components/Layout";
import { ProjectLayout } from "@/components/ProjectLayout";
import { LoadingState } from "@/components/LoadingState";
import { toast, Toaster } from "react-hot-toast";
import { InformationCircleIcon, TrashIcon, LinkIcon } from "@heroicons/react/24/outline";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ProjectFiles() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTip, setShowTip] = useState(true);

  const { data: filesData, error, mutate } = useSWR(
    projectId ? `/api/projects/${projectId}/files` : null,
    fetcher
  );

  const files = filesData?.files || [];

  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fileName.trim() || !fileUrl.trim()) {
      toast.error("Please provide both file name and URL");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, fileUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add file");
      }

      toast.success("File added successfully!");
      setFileName("");
      setFileUrl("");
      setIsModalOpen(false);
      mutate();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to add file");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete file");
      }

      toast.success("File deleted successfully!");
      mutate();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  if (error) {
    return (
      <Layout title="Project Files">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md shadow-sm transition"
          >
            ← Back to Dashboard
          </button>
          <ProjectLayout projectId={projectId as string} title="Files">
            <div className="text-red-600">Failed to load files</div>
          </ProjectLayout>
        </div>
      </Layout>
    );
  }

  if (!filesData) {
    return (
      <Layout title="Project Files">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md shadow-sm transition"
          >
            ← Back to Dashboard
          </button>
          <ProjectLayout projectId={projectId as string} title="Files">
            <LoadingState
              fullScreen={false}
              title="Loading files"
              message="We're gathering the project files for you."
              tone="brand"
            />
          </ProjectLayout>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Project Files">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md shadow-sm transition"
        >
          ← Back to Dashboard
        </button>
        <ProjectLayout projectId={projectId as string} title="Files">
          <div className="space-y-6">
            {/* Tip Bubble */}
            {showTip && (
              <div className="relative rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <InformationCircleIcon className="h-6 w-6 flex-shrink-0 text-blue-600" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-blue-900">File Sharing Tip</h3>
                    <p className="mt-1 text-sm text-blue-800">
                      Relevant files should be shared from an online repository such as OneDrive, 
                      Dropbox, Google Drive, etc. Please ensure that the file is already shared 
                      with all members of the team so they have access through the link.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTip(false)}
                    className="text-blue-600 hover:text-blue-800"
                    aria-label="Dismiss tip"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Add File Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Project Files</h2>
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              >
                + Add File
              </button>
            </div>

            {/* Files List */}
            {files.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <LinkIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">No files added yet</p>
                <p className="mt-1 text-xs text-gray-500">
                  Click &quot;Add File&quot; to share a file link with the team
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Added By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Connected Tasks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {files.map((file: any) => (
                      <tr key={file.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <a
                            href={file.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2"
                          >
                            <LinkIcon className="h-4 w-4" />
                            {file.fileName}
                          </a>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {file.addedBy?.name || file.addedBy?.email || "Unknown"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {file.connectedTasks?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {file.connectedTasks.map((task: any) => (
                                <span
                                  key={task.id}
                                  className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                                >
                                  {task.title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">No tasks connected</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="text-red-600 hover:text-red-800 transition"
                            title="Delete file"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ProjectLayout>
      </div>

      {/* Add File Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add File Link</h3>
            <form onSubmit={handleAddFile} className="space-y-4">
              <div>
                <label htmlFor="fileName" className="block text-sm font-medium text-gray-700 mb-1">
                  File Name
                </label>
                <input
                  id="fileName"
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., Project Requirements.pdf"
                  required
                />
              </div>
              <div>
                <label htmlFor="fileUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  File URL
                </label>
                <input
                  id="fileUrl"
                  type="url"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="https://drive.google.com/..."
                  required
                />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setFileName("");
                    setFileUrl("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Adding..." : "Add File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toaster position="bottom-right" />
    </Layout>
  );
}
