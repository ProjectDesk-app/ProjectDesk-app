import useSWR from "swr";
import { toast } from "react-hot-toast";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load blocked emails");
  }

  return payload;
};

type BlockedEmailRow = {
  id: number;
  email: string;
  reason: string | null;
  createdAt: string;
  blockedBy: {
    id: number;
    name: string | null;
    email: string;
  } | null;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function BlockedEmailsPanel() {
  const { data, error, isLoading, mutate } = useSWR<BlockedEmailRow[]>(
    "/api/admin/blocked-emails",
    fetcher
  );

  const unblockEmail = async (entry: BlockedEmailRow) => {
    const confirmed = window.confirm(
      `Allow ${entry.email} to create a ProjectDesk account again?`
    );
    if (!confirmed) return;

    try {
      const response = await fetch("/api/admin/blocked-emails", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedEmailId: entry.id }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to unblock email");
      }

      toast.success("Email unblocked");
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Unable to unblock email");
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Blocked emails</h2>
          <p className="mt-1 text-sm text-gray-600">
            Blocked users are removed from the app and their email addresses are kept here so they cannot sign up again.
          </p>
        </div>
        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          {data?.length ?? 0} blocked
        </span>
      </div>

      {isLoading && <p className="mt-4 text-sm text-gray-500">Loading blocked emails…</p>}
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm font-semibold text-red-700">Unable to load blocked emails</p>
          <p className="text-xs text-red-600">{error.message}</p>
        </div>
      )}
      {!isLoading && !error && data?.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No blocked emails right now.</p>
      )}

      {data && data.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-3 rounded-md border border-gray-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{entry.email}</p>
                <p className="text-xs text-gray-600">
                  Blocked {formatDateTime(entry.createdAt)}
                  {entry.blockedBy
                    ? ` by ${entry.blockedBy.name || entry.blockedBy.email}`
                    : ""}
                </p>
                {entry.reason && <p className="text-xs text-gray-500">{entry.reason}</p>}
              </div>
              <button
                type="button"
                onClick={() => unblockEmail(entry)}
                className="rounded-md border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
