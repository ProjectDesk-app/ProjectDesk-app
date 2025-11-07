import { useState } from 'react';
import { MemberSelector, ProjectMemberFormValue } from '@/components/projects/MemberSelector';

import { useSession } from "next-auth/react";

export default function ProjectForm({ onCreated }: { onCreated: () => void }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const canCreate = role === "SUPERVISOR" || role === "ADMIN";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState("");
  const [students, setStudents] = useState<ProjectMemberFormValue[]>([]);
  const [collaborators, setCollaborators] = useState<ProjectMemberFormValue[]>([]);

  async function submit() {
    setLoading(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        startDate,
        endDate,
        category,
        members: {
          students,
          collaborators,
        },
      }),
    });
    setLoading(false);
    if (res.ok) {
      setOpen(false);
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setCategory("");
      setStudents([]);
      setCollaborators([]);
      onCreated();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to create project');
    }
  }

  if (!canCreate) {
    return null;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="px-3 py-2 bg-black text-white rounded-md text-sm">
        New Project
      </button>
    );
  }

  return (
    <div className="border rounded-md p-4 w-full max-w-xl bg-white shadow-sm">
      <div className="space-y-3">
        <div className="text-lg font-medium">Create Project</div>
        <input className="border w-full rounded px-3 py-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="border w-full rounded px-3 py-2" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div>
  <label className="block text-sm font-medium mb-1">Category</label>
  <select
    className="border w-full rounded px-3 py-2"
    value={category}
    onChange={(e) => setCategory(e.target.value)}
  >
    <option value="">Select category</option>
    <option value="student-project">Student Project</option>
    <option value="collaboration">Collaboration</option>
  </select>
</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="project-start-date" className="block text-sm font-medium mb-1">
              Start Date
            </label>
            <input
              id="project-start-date"
              type="date"
              className="border w-full rounded px-3 py-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="project-end-date" className="block text-sm font-medium mb-1">
              End Date
            </label>
            <input
              id="project-end-date"
              type="date"
              className="border w-full rounded px-3 py-2"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <MemberSelector
          label="Students"
          role="STUDENT"
          members={students}
          onChange={setStudents}
        />
        <MemberSelector
          label="Collaborators"
          role="COLLABORATOR"
          members={collaborators}
          onChange={setCollaborators}
        />
        <div className="flex gap-2 pt-2">
          <button disabled={loading} onClick={submit} className="px-3 py-2 bg-black text-white rounded-md text-sm">
            {loading ? 'Creating…' : 'Create'}
          </button>
          <button onClick={() => setOpen(false)} className="px-3 py-2 border rounded-md text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
