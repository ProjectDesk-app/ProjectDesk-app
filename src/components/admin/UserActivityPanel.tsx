import Link from "next/link";
import useSWR from "swr";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load user activity");
  }

  return payload;
};

type ActivityData = {
  summary: {
    accountCreatedAt: string;
    projectsCreatedCount: number;
    sponsoredAccountsCount: number;
    pendingRequestsCount: number;
    taskSetsCreatedCount: number;
    projectUpdatesCount: number;
    filesUploadedCount: number;
    commentsCount: number;
  };
  sponsoredUsers: {
    id: number;
    name: string | null;
    email: string;
    role: string;
    createdAt: string;
  }[];
  pendingRequests: {
    id: number;
    name: string | null;
    email: string;
    role: string;
    createdAt: string;
  }[];
  recentActivity: {
    id: string;
    kind: string;
    title: string;
    detail: string | null;
    createdAt: string;
    href: string | null;
  }[];
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

export function UserActivityPanel({ userId }: { userId: number }) {
  const { data, error, isLoading } = useSWR<ActivityData>(
    userId ? `/api/admin/user-activity?userId=${userId}` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Loading user activity…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">Unable to load user activity</p>
        <p className="mt-1 text-xs text-red-600">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  const summaryCards = [
    { label: "Joined", value: formatDateTime(data.summary.accountCreatedAt) },
    { label: "Projects created", value: String(data.summary.projectsCreatedCount) },
    { label: "Sponsored accounts", value: String(data.summary.sponsoredAccountsCount) },
    { label: "Pending requests", value: String(data.summary.pendingRequestsCount) },
    { label: "Task sets", value: String(data.summary.taskSetsCreatedCount) },
    { label: "Updates posted", value: String(data.summary.projectUpdatesCount) },
    { label: "Files added", value: String(data.summary.filesUploadedCount) },
    { label: "Comments posted", value: String(data.summary.commentsCount) },
  ];

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">User activity</h3>
          <p className="text-xs text-gray-500">
            Recent actions and account footprint pulled from projects, sponsorships, files, and comments.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {(data.sponsoredUsers.length > 0 || data.pendingRequests.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Current sponsored accounts
            </p>
            {data.sponsoredUsers.length === 0 ? (
              <p className="mt-2 text-xs text-emerald-900">No active sponsored accounts.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.sponsoredUsers.map((user) => (
                  <li key={user.id} className="rounded-md bg-white px-3 py-2">
                    <p className="text-sm font-semibold text-gray-900">{user.name || user.email}</p>
                    <p className="text-xs text-gray-600">
                      {user.role} • {user.email}
                    </p>
                    <p className="text-[11px] text-gray-500">Joined {formatDateTime(user.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Pending sponsorship requests
            </p>
            {data.pendingRequests.length === 0 ? (
              <p className="mt-2 text-xs text-amber-900">No pending sponsorship requests.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.pendingRequests.map((user) => (
                  <li key={user.id} className="rounded-md bg-white px-3 py-2">
                    <p className="text-sm font-semibold text-gray-900">{user.name || user.email}</p>
                    <p className="text-xs text-gray-600">
                      {user.role} • {user.email}
                    </p>
                    <p className="text-[11px] text-gray-500">Requested {formatDateTime(user.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent timeline</p>
        {data.recentActivity.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No recent activity found for this user.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.recentActivity.map((item) => (
              <li key={item.id} className="rounded-md border border-gray-200 px-3 py-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    {item.href ? (
                      <Link href={item.href} className="text-sm font-semibold text-blue-700 hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    )}
                    {item.detail && <p className="text-xs text-gray-600">{item.detail}</p>}
                  </div>
                  <span className="text-[11px] text-gray-500">{formatDateTime(item.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
