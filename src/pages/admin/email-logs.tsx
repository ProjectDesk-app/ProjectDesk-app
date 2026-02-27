import { useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import Link from "next/link";
import useSWR from "swr";
import { getServerSession } from "next-auth/next";
import Layout from "@/components/Layout";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

type EmailLogRow = {
  id: number;
  to: string;
  subject: string;
  messagePreview: string;
  status: "SENT" | "FAILED" | "MOCK" | string;
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
};

type EmailLogsResponse = {
  items: EmailLogRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    q: string;
    status: string;
  };
};

async function fetcher(url: string): Promise<EmailLogsResponse> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load email logs");
  }
  return payload as EmailLogsResponse;
}

export default function AdminEmailLogsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"ALL" | "SENT" | "FAILED" | "MOCK">("ALL");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const pageSize = 25;

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status !== "ALL") params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    return `/api/admin/email-logs?${params.toString()}`;
  }, [page, pageSize, query, status]);

  const { data, error, isLoading } = useSWR<EmailLogsResponse>(endpoint, fetcher);

  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  const items = data?.items ?? [];

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const statusClassName = (value: string) => {
    if (value === "SENT") return "bg-green-100 text-green-800";
    if (value === "FAILED") return "bg-red-100 text-red-800";
    if (value === "MOCK") return "bg-amber-100 text-amber-800";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <Layout title="Email Logs">
      <div className="space-y-6">
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Email delivery logs</h1>
          <p className="mt-2 text-sm text-blue-900">
            Review outbound email attempts, status, and provider responses.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/admin" className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-blue-700 hover:bg-blue-100">
              Back to admin
            </Link>
            <Link href="/admin/email-test" className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-blue-700 hover:bg-blue-100">
              Send test email
            </Link>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(queryInput);
            }}
          >
            <label className="flex-1 text-sm font-medium text-gray-700">
              Search
              <input
                type="text"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search by recipient, subject, body preview, or error"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Status
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as "ALL" | "SENT" | "FAILED" | "MOCK");
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-40"
              >
                <option value="ALL">All</option>
                <option value="SENT">Sent</option>
                <option value="FAILED">Failed</option>
                <option value="MOCK">Mock</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Apply
            </button>
          </form>

          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{isLoading ? "Loading..." : `${total} log${total === 1 ? "" : "s"} found`}</span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error.message}
            </div>
          )}

          {!error && !isLoading && items.length === 0 && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">
              No email logs match your filters.
            </div>
          )}

          {!error && items.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">When</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">To</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Subject</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Provider</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(item.createdAt)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClassName(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.to}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.subject}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div>{item.provider || "—"}</div>
                        {item.providerMessageId && (
                          <div className="mt-1 text-xs text-gray-500">ID: {item.providerMessageId}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <details>
                          <summary className="cursor-pointer text-blue-700 hover:text-blue-800">View body preview</summary>
                          <p className="mt-2 whitespace-pre-wrap text-xs text-gray-600">{item.messagePreview}</p>
                        </details>
                        {item.error && (
                          <p className="mt-2 whitespace-pre-wrap rounded-md bg-red-50 p-2 text-xs text-red-700">
                            {item.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") {
    return {
      redirect: {
        destination: "/signin",
        permanent: false,
      },
    };
  }

  return { props: {} };
};
