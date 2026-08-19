import { useRouter } from "next/router";
import useSWR from "swr";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { toast, Toaster } from "react-hot-toast";
import { MemberSelector, ProjectMemberFormValue } from "@/components/projects/MemberSelector";
import { UserLookup } from "@/components/admin/UserLookup";
import { useSession } from "next-auth/react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PrincipalInvestigator = {
  id: number;
  name: string | null;
  email: string;
  role: string;
};

export default function EditProject() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const { data: project, mutate } = useSWR(id ? `/api/projects/${id}` : null, fetcher);

  const [form, setForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    category: "",
  });
  const [students, setStudents] = useState<ProjectMemberFormValue[]>([]);
  const [collaborators, setCollaborators] = useState<ProjectMemberFormValue[]>([]);
  const [principalInvestigator, setPrincipalInvestigator] =
    useState<PrincipalInvestigator | null>(null);
  const [formInitialized, setFormInitialized] = useState(false);
  const [membersInitialized, setMembersInitialized] = useState(false);

  useEffect(() => {
    if (project && !formInitialized) {
      setForm({
        title: project.title || "",
        description: project.description || "",
        startDate: project.startDate ? project.startDate.split("T")[0] : "",
        endDate: project.endDate ? project.endDate.split("T")[0] : "",
        category: project.category || "",
      });
      if (project.supervisor) {
        setPrincipalInvestigator({
          id: project.supervisor.id,
          name: project.supervisor.name,
          email: project.supervisor.email,
          role: project.supervisor.role,
        });
      }
      setFormInitialized(true);
    }
  }, [project, formInitialized]);

  useEffect(() => {
    if (project && !membersInitialized) {
      setStudents(
        (project.students || []).map((member: any) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: "STUDENT",
        }))
      );
      setCollaborators(
        (project.collaborators || []).map((member: any) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: "COLLABORATOR",
        }))
      );
      setMembersInitialized(true);
    }
  }, [project, membersInitialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          supervisorId: isAdmin ? principalInvestigator?.id : undefined,
          members: {
            students,
            collaborators,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to update project");

      toast.success("Project updated successfully!");
      mutate();
      router.push(`/projects/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Error updating project");
    }
  };

  const handlePrincipalInvestigatorSelect = (option: PrincipalInvestigator) => {
    if (option.role !== "SUPERVISOR" && option.role !== "ADMIN") {
      toast.error("Principal investigator must be a supervisor or admin.");
      return;
    }
    setPrincipalInvestigator(option);
  };

  return (
    <Layout title="Edit Project">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-md shadow">
        <h1 className="text-2xl font-semibold mb-4">Edit Project</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="border w-full rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="border w-full rounded-md px-3 py-2"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="border w-full rounded-md px-3 py-2"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="border w-full rounded-md px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="border rounded-md w-full px-3 py-2"
            >
              <option value="">Select category</option>
              <option value="student-project">Student Project</option>
              <option value="collaboration">Collaboration</option>
            </select>
        </div>

          {isAdmin && (
            <div className="rounded-md border border-blue-100 bg-blue-50 p-4">
              <label className="block text-sm font-semibold text-gray-900">
                Principal investigator
              </label>
              <p className="mt-1 text-xs text-gray-600">
                Admin-only: reassign ownership of this project to another supervisor or admin.
              </p>
              {principalInvestigator && (
                <div className="mt-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">
                    {principalInvestigator.name || principalInvestigator.email}
                  </p>
                  <p className="text-xs text-gray-600">
                    {principalInvestigator.email} • {principalInvestigator.role}
                  </p>
                </div>
              )}
              <div className="mt-3">
                <UserLookup onSelect={handlePrincipalInvestigatorSelect} />
              </div>
            </div>
          )}

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

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => router.push(`/projects/${id}`)}
              className="px-4 py-2 bg-gray-300 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
      <Toaster position="bottom-right" />
    </Layout>
  );
}
