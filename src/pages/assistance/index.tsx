import Layout from "@/components/Layout";
import useSWR from "swr";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { GraduationCap } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AssistanceGallery() {
  const { data: session } = useSession();
  const { data, error } = useSWR("/api/assistance", fetcher);

  if (!session) return <p className="p-6">Please sign in to view this page.</p>;
  const userRole = (session.user as any)?.role;
  if (!userRole || (userRole !== "SUPERVISOR" && userRole !== "ADMIN"))
    return <p className="p-6 text-red-600">Access denied.</p>;
  if (error) return <p className="p-6 text-red-600">Error loading tasks.</p>;
  if (!data)
    return (
      <Layout title="Assistance Gallery">
        <LoadingState
          title="Gathering flagged tasks"
          message="We're pulling the latest support requests from your teams."
          tone="brand"
        />
      </Layout>
    );

  const tasks = data.flaggedTasks || [];

  return (
    <Layout title="Assistance Gallery">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <GraduationCap className="h-6 w-6 text-gray-800" />
            <span>Student Support Hub</span>
          </h1>
          <p className="mt-2 text-sm text-blue-900">
            Review flagged tasks from your teams and respond quickly to unblock progress across projects.
          </p>
        </div>

        {tasks.length === 0 ? (
          <p className="text-gray-600">No flagged tasks right now 🎉</p>
        ) : (
          <ul className="space-y-4">
            {tasks.map((task: any) => (
              <li
                key={task.id}
                className="border rounded-md p-4 shadow-sm bg-white hover:bg-gray-50 transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-900">{task.title}</p>
                    <p className="text-sm text-gray-600">
                      Project: <span className="font-medium">{task.project.title}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                      Flagged by: {task.flaggedByName || "Unknown (N/A)"}
                    </p>
                  </div>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Task →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
