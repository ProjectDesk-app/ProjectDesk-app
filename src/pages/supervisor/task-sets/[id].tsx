import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { useSession } from "next-auth/react";
import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { GripVertical } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingState } from "@/components/LoadingState";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function TaskSetDetails() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession();
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, mutate } = useSWR(
    id ? `/api/tasksets/${id}/templates` : null,
    fetcher
  );
  const [newTemplate, setNewTemplate] = useState({ title: "", description: "", dueOffset: "", duration: "" });
  // State to track which template is being edited
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  // State to hold editable fields for the template being edited
  const [editFields, setEditFields] = useState<{ title: string; description: string; dueOffset: string; duration: string }>({ title: "", description: "", dueOffset: "", duration: "" });
  // Local state for ordering
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    const currentIds = (Array.isArray(data)
      ? data.map((t: any) => t.id)
      : data.templates?.map((t: any) => t.id) || []
    ).map((id: any) => String(id));

    setLocalOrder((prev) => {
      if (prev.length === 0) {
        return currentIds;
      }

      const filteredPrev = prev.filter((id: string) => currentIds.includes(id));
      const additions = currentIds.filter((id: string) => !filteredPrev.includes(id));
      const merged = [...filteredPrev, ...additions];

      const changed =
        merged.length !== prev.length ||
        merged.some((id, index) => id !== prev[index]);

      if (changed) {
        return merged;
      }

      // Preserve existing local order when nothing changed structurally
      return prev;
    });
  }, [data]);

  useEffect(()=>{
  }, [localOrder]);

  // Security check
  const userRole = (session?.user as any)?.role;
  const canManageTaskSets = userRole === "SUPERVISOR" || userRole === "ADMIN";
  if (!canManageTaskSets) {
    return (
      <Layout title="Access Denied">
        <p className="p-6 text-red-600">Access denied.</p>
      </Layout>
    );
  }

  // Add new template logic
  const handleAddTemplate = async () => {
    if (!newTemplate.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const res = await fetch(`/api/tasksets/${id}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTemplate),
    });

    if (res.ok) {
      await mutate(); // refresh task list immediately
      toast.success("Task added");
      setNewTemplate({ title: "", description: "", dueOffset: "", duration: "" });
    } else {
      const err = await res.json();
      toast.error(err.error || "Error adding task");
    }
  };

  // Error/loading UI
  if (error)
    return (
      <Layout title="Task Set">
        <p className="p-6 text-red-600">Failed to load task set.</p>
      </Layout>
    );
  if (!data)
    return (
      <Layout title="Task Set">
        <LoadingState
          title="Preparing task set"
          message="We are loading template details so you can fine-tune them."
          tone="brand"
        />
      </Layout>
    );

  // Handle template update
  const handleUpdateTemplate = async (templateId: string) => {
    if (!editFields.title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      const res = await fetch(`/api/tasksets/${id}/templates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          title: editFields.title,
          description: editFields.description,
          dueOffset: editFields.dueOffset ? Number(editFields.dueOffset) : null,
          duration: editFields.duration ? Number(editFields.duration) : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Error updating task");
        return;
      }

      toast.success("Task updated successfully");
      setEditingTemplateId(null);
      mutate();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Network error");
    }
  };

  // Handle template deletion
  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      const res = await fetch(`/api/tasksets/${id}/templates/${templateId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Task deleted");
        mutate();
      } else {
        const err = await res.json();
        toast.error(err.error || "Error deleting task");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  // Function to update task order on the server
  const updateTaskOrder = async (newOrder: string[]) => {
    try {
      const payload = {
        orderedTasks: newOrder.map((taskId, index) => ({
          id: Number(taskId),
          order: index,
        })),
      };

      const res = await fetch(`/api/tasksets/${id}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Task order updated");
        await mutate(); // ensure SWR refetches latest data
        const refreshed = await fetch(`/api/tasksets/${id}/templates`).then((r) => r.json());
        const updatedTemplates = Array.isArray(refreshed)
          ? refreshed
          : refreshed.templates || [];
        setLocalOrder(updatedTemplates.map((t: any) => String(t.id)));
      } else {
        const err = await res.json();
        toast.error(err.error || "Error updating task order");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  // Handle drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localOrder.indexOf(active.id.toString());
      const newIndex = localOrder.indexOf(over.id.toString());
      const newOrder = arrayMove(localOrder, oldIndex, newIndex);
      setLocalOrder(newOrder);
      updateTaskOrder(newOrder);
    }
  };

  // Get the list of templates based on data shape and sort by order
  const templates = (Array.isArray(data) ? data : data.templates || []).sort(
    (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
  );

  // Sort templates by localOrder, normalizing ID types
  const orderedTemplates = localOrder
    .map((id: string) => templates.find((t: any) => String(t.id) === String(id)))
    .filter((t): t is typeof templates[0] => !!t);

  // SortableItem component
  function SortableItem({ id, children, handle }: { id: string; children: React.ReactNode; handle: React.ReactNode }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const cardStyle: CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 999 : undefined,
      backgroundColor: isDragging ? '#f0f0f0' : undefined,
      position: 'relative',
    };

    return (
      <li
        ref={setNodeRef}
        style={cardStyle}
        data-id={id}
        className={`rounded-lg shadow-sm border bg-white px-3 py-2 relative`}
      >
        {/* Drag handle in top-right */}
        <div className="absolute top-2 right-2">
          <span
            {...listeners}
            {...attributes}
            className={`p-1 rounded cursor-grab hover:bg-gray-100 active:cursor-grabbing`}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              backgroundColor: isDragging ? '#e5e7eb' : undefined,
              transition: 'background 0.1s',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            tabIndex={0}
            aria-label="Drag to reorder"
          >
            <GripVertical size={18} />
          </span>
        </div>
        {children}
      </li>
    );
  }

  return (
    <Layout title={`Task Set #${id}`}>
      <div className="max-w-4xl mx-auto p-6 space-y-6 text-gray-700">
        <button
          onClick={() => router.push("/supervisor/task-library")}
          className="text-blue-600 hover:underline"
        >
          ← Back to Task Library
        </button>

        <h1 className="text-2xl font-semibold">
          Tasks in this Set{data && !Array.isArray(data) && data.name ? ` (${data.name})` : ""}
        </h1>
        <h3 className="text-gray-600 mb-4">Drag and drop to reorder tasks</h3>

        <div className="space-y-3">
          {(!templates || templates.length === 0) && (
            <p>No tasks yet. Add one below.</p>
          )}

          {templates.length > 0 && (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              onDragStart={(event) => {}}
              onDragCancel={() => {}}
            >
              <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
                <ul className="space-y-3">
                  {orderedTemplates.map((t) => (
                    <SortableItem
                      key={String(t.id)}
                      id={String(t.id)}
                      handle={
                        // This prop is not used, but kept for possible future handle refactor
                        <GripVertical />
                      }
                    >
                      {/* Card layout */}
                      {editingTemplateId === t.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={editFields.title}
                            onChange={(e) =>
                              setEditFields((f) => ({ ...f, title: e.target.value }))
                            }
                            className="border rounded px-3 py-2 w-full mb-1"
                            placeholder="Title"
                          />
                          <textarea
                            value={editFields.description}
                            onChange={(e) =>
                              setEditFields((f) => ({ ...f, description: e.target.value }))
                            }
                            className="border rounded px-3 py-2 w-full mb-1"
                            placeholder="Description (optional)"
                          />
                          <input
                            type="number"
                            value={editFields.dueOffset}
                            onChange={(e) =>
                              setEditFields((f) => ({ ...f, dueOffset: e.target.value }))
                            }
                            className="border rounded px-3 py-2 w-full mb-1"
                            placeholder="Due Offset (days after project start) (optional)"
                          />
                          <input
                            type="number"
                            value={editFields.duration}
                            onChange={(e) =>
                              setEditFields((f) => ({ ...f, duration: e.target.value }))
                            }
                            className="border rounded px-3 py-2 w-full mb-1"
                            placeholder="Duration (days) (optional)"
                          />
                          <div className="flex gap-2 justify-end mt-2">
                            <button
                              onClick={() => handleUpdateTemplate(t.id)}
                              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTemplateId(null)}
                              className="bg-gray-300 px-3 py-1 rounded hover:bg-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col min-h-[64px]">
                          <div className="flex-1">
                            <div className="font-medium text-base">{t.title}</div>
                            {t.description && (
                              <div className="text-sm text-gray-600">{t.description}</div>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              {t.dueOffset && (
                                <div className="text-xs text-gray-400">
                                  Due {t.dueOffset} days after project start
                                </div>
                              )}
                              {t.duration && (
                                <div className="text-xs text-gray-400">
                                  Duration: {t.duration} days
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 mt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTemplateId(t.id);
                                setEditFields({
                                  title: t.title || "",
                                  description: t.description || "",
                                  dueOffset: t.dueOffset ? String(t.dueOffset) : "",
                                  duration: t.duration ? String(t.duration) : "",
                                });
                              }}
                              className="text-xs text-blue-600 hover:underline bg-transparent px-0 py-0 font-normal"
                              style={{ minWidth: 0, minHeight: 0 }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(t.id)}
                              className="text-xs text-red-600 hover:underline bg-transparent px-0 py-0 font-normal"
                              style={{ minWidth: 0, minHeight: 0 }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="border-t pt-4">
          <h2 className="text-xl font-semibold mb-3">Add New Task to this Set</h2>
          <input
            type="text"
            placeholder="Title"
            value={newTemplate.title}
            onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
            className="border rounded px-3 py-2 w-full mb-2"
          />
          <textarea
            placeholder="Description (optional)"
            value={newTemplate.description}
            onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
            className="border rounded px-3 py-2 w-full mb-2"
          />
          <input
            type="number"
            placeholder="Due Offset (days after project start) (optional)"
            value={newTemplate.dueOffset}
            onChange={(e) => setNewTemplate({ ...newTemplate, dueOffset: e.target.value })}
            className="border rounded px-3 py-2 w-full mb-2"
          />
          <input
            type="number"
            placeholder="Duration (days) (optional)"
            value={newTemplate.duration}
            onChange={(e) => setNewTemplate({ ...newTemplate, duration: e.target.value })}
            className="border rounded px-3 py-2 w-full mb-2"
          />
          <button
            onClick={handleAddTemplate}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Add Task to Set
          </button>
        </div>
      </div>
    </Layout>
  );
}
