import { toast } from "react-hot-toast";
import ProjectForm from "@/components/ProjectForm";
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import useSWR from "swr";
import Layout from "@/components/Layout";
import { Toaster } from "react-hot-toast";
import { useState } from "react";
import { LayoutDashboard } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Dashboard() {
  const [category, setCategory] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const { data, mutate } = useSWR(
  category === "all" ? "/api/projects" : `/api/projects?category=${category}`,
  fetcher
);

  if (!data) return <Layout title="Dashboard"><p>Loading…</p></Layout>;

  const projects = Array.isArray(data) ? data : [];
  const activeProjects = projects.filter((p: any) => !p.isCompleted);
  const completedProjects = projects.filter((p: any) => p.isCompleted);

  const renderProject = (p: any) => {
    const progress = (() => {
      if (!p.startDate || !p.endDate) return 0;
      const now = new Date().getTime();
      const start = new Date(p.startDate).getTime();
      const end = new Date(p.endDate).getTime();
      return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    })();

    // Always use blue for progress bar
    const progressColor = "bg-blue-500";

    const assignedPeople = [
      ...(p.students?.map((s: any) => s.name) || []),
      ...(p.collaborators?.map((c: any) => c.name) || []),
    ];

    const supervisorName = p.supervisor?.name ? ` (Supervisor: ${p.supervisor.name})` : "";

    const assignedText = assignedPeople.length
      ? `${assignedPeople.join(", ")}${supervisorName}`
      : p.supervisor?.name
      ? `Supervisor: ${p.supervisor.name}`
      : "Unassigned";

    const statusLabel = p.isCompleted ? "Completed" : p.status || "Unknown";

    const statusClass = p.isCompleted
      ? "bg-green-200 text-green-800"
      : p.status === "On Track"
      ? "bg-green-100 text-green-800"
      : p.status === "At Risk"
      ? "bg-yellow-100 text-yellow-800"
      : p.status === "Danger"
      ? "bg-orange-100 text-orange-800"
      : p.status === "Failing" || p.status === "Behind Schedule"
      ? "bg-red-100 text-red-800"
      : "bg-gray-200 text-gray-600";

    return (
      <li
        key={p.id}
        className="border rounded-md p-4 hover:bg-gray-50 transition flex flex-col justify-between"
      >
        <a href={`/projects/${p.id}`} className="block">
          <div className="flex justify-between items-start">
            <h2 className="font-medium text-lg">{p.title}</h2>
            {p.category && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {p.category.replace("-", " ")}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 mt-1 truncate">{assignedText}</p>
          <p className="text-xs text-gray-500 mt-1">
            {p.startDate
              ? new Date(p.startDate).toLocaleDateString()
              : "?"}{" "}
            —{" "}
            {p.endDate
              ? new Date(p.endDate).toLocaleDateString()
              : "?"}
          </p>

          {/* Project status */}
          {statusLabel && (
            <span
              className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded mt-2 ${statusClass}`}
            >
              {statusLabel}
            </span>
          )}

          <div className="h-2 bg-gray-200 rounded-full mt-2">
            <div
              className={`h-2 rounded-full ${progressColor}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </a>
      </li>
    );
  };

  return (
    <Layout title="Dashboard">
      <div className="space-y-6 mb-6">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <LayoutDashboard className="h-6 w-6 text-gray-800" />
            <span>Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-blue-900">
            Overview page of your projects. The blue line indicates the timeframe of the project.
          </p>
        </div>
      </div>

      <div className="mb-6 flex justify-between items-center">
        <ProjectForm
          onCreated={() => {
            mutate();
            toast.success("Project created successfully!");
          }}
        />
        <label className="hidden md:flex items-center gap-2 text-sm text-gray-600">
          <span>Filter:</span>
          <select
            className="border rounded-md px-3 py-1 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All</option>
            <option value="student-project">Student Projects</option>
            <option value="collaboration">Collaborations</option>
          </select>
        </label>
      </div>

      <h2 className="text-xl font-semibold mb-3">Active Projects</h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {activeProjects.map(renderProject)}
      </ul>

      <div className="mt-8">
        <h2
          className="text-xl font-semibold mb-3 cursor-pointer flex items-center justify-between"
          onClick={() => setShowCompleted(!showCompleted)}
        >
          Completed Projects
          <span className="text-sm text-gray-500">
            {showCompleted ? "▲ Hide" : "▼ Show"}
          </span>
        </h2>
        {showCompleted && (
          <ul className="grid gap-4 sm:grid-cols-2 opacity-70">
            {completedProjects.map(renderProject)}
          </ul>
        )}
      </div>
      <Toaster position="bottom-right" />
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) {
    return { redirect: { destination: '/api/auth/signin', permanent: false } };
  }
  return { props: {} };
};
