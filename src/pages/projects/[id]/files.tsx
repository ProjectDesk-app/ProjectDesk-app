import Layout from "@/components/Layout";
import { ProjectLayout } from "@/components/ProjectLayout";
import { LoadingState } from "@/components/LoadingState";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { toast, Toaster } from "react-hot-toast";
import {
  DocumentIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

type FileItem = {
  id: number;
  name: string;
  url: string;
  type: "FILE" | "FOLDER";
  createdAt: string;
  user?: {
    id: number;
    name?: string | null;
    email?: string | null;
  };
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const formatDateTime = (value?: string | null) => {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ProjectFiles() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null,
    fetcher
  );

  const [sortMode, setSortMode] = useState<"name" | "date">("name");
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"FILE" | "FOLDER">("FILE");

  const { data: filesData, error: filesError, mutate } = useSWR(
    projectId ? `/api/projects/${projectId}/files${sortMode === "date" ? "?sort=date" : ""}` : null,
    fetcher
  );

  const files: FileItem[] = Array.isArray(filesData?.files)
    ? filesData.files
    : [];

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = Array.isArray(files) ? files.slice() : [];
    if (sortMode === "name") {
      list.sort((a, b) => {
        if (a.type !== b.type) return a.type === "FOLDER" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return term
      ? list.filter(
          (item) =>
            item.name.toLowerCase().includes(term) ||
            item.url.toLowerCase().includes(term)
        )
      : list;
  }, [files, searchTerm, sortMode]);

  const openCreateModal = () => {
    setEditingFile(null);
    setName("");
    setUrl("");
    setType("FILE");
    setShowModal(true);
  };

  const openEditModal = (file: FileItem) => {
    setEditingFile(file);
    setName(file.name);
    setUrl(file.url);
    setType(file.type);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingFile(null);
    setIsSaving(false);
  };

  const submitFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    if (!name.trim()) {
      toast.error("Filename is required");
      return;
    }
    if (!url.trim()) {
      toast.error("File URL is required");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: editingFile ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingFile?.id,
          name: name.trim(),
          url: url.trim(),
          type,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save file");
      }
      toast.success(editingFile ? "File updated" : "File added");
      closeModal();
      await mutate();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not save file"
      );
      setIsSaving(false);
    }
  };

  const deleteFile = async (fileId: number) => {
    if (!projectId) return;
    if (!confirm("Remove this file link?")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fileId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to delete file");
      }
      toast.success("File removed");
      await mutate();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not delete file");
    }
  };

  if (!project) {
    return (
      <Layout title="Project Files">
        <LoadingState
          title="Loading project files"
          message="Bringing up project details..."
          tone="brand"
        />
      </Layout>
    );
  }

  return (
    <Layout title={`Project Files – ${project.title}`}>
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md shadow-sm transition"
        >
          ← Back to Dashboard
        </button>
        <ProjectLayout
          projectId={(projectId as string) || String(project.id)}
          title={project.title}
          category={project.category}
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Project files & links
                </h2>
                <p className="text-sm text-gray-600">
                  Keep track of shared folders and files for this project.
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                onClick={openCreateModal}
              >
                + Add link
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <div className="font-semibold">
                Share links to folders or files your team needs.
              </div>
              <p>
                Paste the URL to OneDrive, Dropbox, Google Drive or similar and make sure team members are collaborators so they can open it. For less admin, consider linking the project folder instead of lots of individual files.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="search"
                  className="pl-9 pr-3 py-2 rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Search files or URLs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <label className="text-sm text-gray-700 flex items-center gap-2">
                Sort by:
                <select
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as "name" | "date")}
                >
                  <option value="name">Folders then files (A–Z)</option>
                  <option value="date">Newest first</option>
                </select>
              </label>
            </div>

            {filesError && (
              <p className="text-sm text-red-600">Failed to load files.</p>
            )}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">
                    {searchTerm
                      ? "No files match your search."
                      : "No files added yet. Share your first link to get started."}
                  </div>
                ) : (
                  filtered.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {file.type === "FOLDER" ? (
                          <FolderIcon className="h-6 w-6 text-amber-500" aria-hidden="true" />
                        ) : (
                          <DocumentIcon className="h-6 w-6 text-blue-500" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-sm font-semibold text-blue-700 hover:underline"
                            title={file.name}
                          >
                            {file.name}
                          </a>
                          <p className="truncate text-xs text-gray-500" title={file.url}>
                            {file.url}
                          </p>
                          <p className="text-xs text-gray-500">
                            Added by{" "}
                            <span className="font-medium text-gray-700">
                              {file.user?.name || file.user?.email || "Unknown"}
                            </span>{" "}
                            on {formatDateTime(file.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                          {file.type === "FOLDER" ? "Folder" : "File"}
                        </span>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          onClick={() => openEditModal(file)}
                        >
                          <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          onClick={() => deleteFile(file.id)}
                        >
                          <TrashIcon className="h-4 w-4" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ProjectLayout>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingFile ? "Edit link" : "Add file or folder link"}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Provide a shareable URL and make sure your teammates have access.
            </p>
            <form onSubmit={submitFile} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800">
                  Filename
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Project plan.docx"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={180}
                  required
                  disabled={isSaving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800">
                  File location URL
                </label>
                <input
                  type="url"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={isSaving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800">
                  Type
                </label>
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  value={type}
                  onChange={(e) => setType(e.target.value as "FILE" | "FOLDER")}
                  disabled={isSaving}
                >
                  <option value="FILE">File</option>
                  <option value="FOLDER">Folder</option>
                </select>
              </div>
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                Add the link to your shared file or folder (OneDrive, Dropbox, Google Drive, etc.). Double-check that the team has access, and consider linking the main project folder so everyone can reach all files in one place.
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-end sm:space-x-3 gap-3">
                <button
                  type="button"
                  className="w-full sm:w-auto rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : editingFile ? "Save changes" : "Add link"}
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
