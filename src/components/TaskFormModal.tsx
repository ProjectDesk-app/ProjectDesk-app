import { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { toast } from "react-hot-toast";

export default function TaskFormModal({ projectId, isOpen, onClose, mutate }: any) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    dueDate: "",
  });
  const [users, setUsers] = useState<any[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) return;
    const fetchUsers = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/users`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        console.error(err);
        toast.error("Error loading users");
      }
    };
    fetchUsers();
  }, [projectId]);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Toggle user assignment when a checkbox is clicked
  const toggleAssignedUser = (userId: string) => {
    setAssignedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, assignedUserIds }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      toast.success("Task created!");
      mutate(); // Refresh task list
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error creating task");
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <Dialog.Panel className="bg-white p-6 rounded-lg w-full max-w-md">
        <Dialog.Title className="text-lg font-semibold mb-4">Create New Task</Dialog.Title>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="title" className="block mb-1 font-medium">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Task title"
            value={formData.title}
            onChange={handleChange}
            required
            className="border rounded w-full p-2"
          />
          <label htmlFor="description" className="block mb-1 font-medium">Description</label>
          <textarea
            id="description"
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleChange}
            className="border rounded w-full p-2"
          />
          <label htmlFor="dueDate" className="block mb-1 font-medium">Due Date</label>
          <input
            type="date"
            id="dueDate"
            name="dueDate"
            value={formData.dueDate}
            onChange={handleChange}
            className="border rounded w-full p-2"
          />
          <div>
            <label className="block mb-1 font-medium">Assign Users</label>
            <div className="border rounded w-full p-2 max-h-32 overflow-y-auto">
              {users.length === 0 && (
                <span className="text-gray-400 text-sm">No users available</span>
              )}
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(user.id)}
                    onChange={() => toggleAssignedUser(user.id)}
                    className="accent-blue-600"
                  />
                  <span>{user.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded">
              Cancel
            </button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
              Create Task
            </button>
          </div>
        </form>
      </Dialog.Panel>
    </Dialog>
  );
}