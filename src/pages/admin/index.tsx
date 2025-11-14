import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { toast, Toaster } from "react-hot-toast";
import { ShieldCheck, Users, UserPlus, CreditCard, AlertTriangle } from "lucide-react";
import { UserLookup } from "@/components/admin/UserLookup";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type UserRow = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  emailVerified?: string | null;
  subscriptionType?: string | null;
  subscriptionExpiresAt?: string | null;
};

type SubscriptionMetrics = {
  summary: Record<string, number>;
  totals: {
    totalUsers: number;
    activeSubscribers: number;
    freeTrials: number;
    sponsoredAccounts: number;
    cancelledAccounts: number;
  };
  freeTrialsEndingSoon: {
    id: number;
    name: string | null;
    email: string;
    subscriptionExpiresAt: string | null;
    daysRemaining: number | null;
  }[];
  cancelledSupervisors: {
    id: number;
    name: string | null;
    email: string;
    goCardlessSubscriptionStatus: string | null;
  }[];
  sponsorAlerts: {
    impactedCount: number;
    users: {
      id: number;
      name: string | null;
      email: string;
      role: string;
      sponsorName: string | null;
      sponsorEmail: string | null;
    }[];
  };
  goCardlessStatusCounts: {
    status: string;
    count: number;
  }[];
};

const ROLE_DESCRIPTIONS: Record<string, string[]> = {
  ADMIN: ["View and manage all projects", "Manage users and billing", "Send invitations"],
  SUPERVISOR: ["Create and manage own projects", "Assign tasks", "Monitor student progress"],
  STUDENT: ["View assigned projects", "Update task progress", "Collaborate via comments"],
  COLLABORATOR: ["Assist on shared tasks", "Leave updates and comments"],
};

export default function AdminDashboard() {
  const { data: users, mutate } = useSWR<UserRow[]>("/api/admin/users", fetcher);
  const { data: subscriptionMetrics } = useSWR<SubscriptionMetrics>("/api/admin/subscription-metrics", fetcher);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("STUDENT");
  const [loadingRole, setLoadingRole] = useState<number | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState<number | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [activeSubscriptionList, setActiveSubscriptionList] = useState<null | { label: string; filters: string[]; value?: number | null }>(null);
  const subscriptionOptions = useMemo(
    () => ["ADMIN_APPROVED", "SUBSCRIBED", "FREE_TRIAL", "SPONSORED", "CANCELLED"],
    []
  );

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDaysRemaining = (value: number | null) => {
    if (value === null) return "Date TBD";
    if (value === 0) return "Expires today";
    return `${value} day${value === 1 ? "" : "s"} left`;
  };

  const titleCase = (value?: string | null) => {
    if (!value) return "Unknown";
    return value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Active subscribers",
        value: subscriptionMetrics?.totals.activeSubscribers ?? null,
        helper: "Paid & admin-approved supervisors",
        filters: ["SUBSCRIBED", "ADMIN_APPROVED"],
      },
      {
        label: "Free trials",
        value: subscriptionMetrics?.totals.freeTrials ?? null,
        helper: "Supervisors still in their trial window",
        filters: ["FREE_TRIAL"],
      },
      {
        label: "Sponsored accounts",
        value: subscriptionMetrics?.totals.sponsoredAccounts ?? null,
        helper: "Students & collaborators linked to supervisors",
        filters: ["SPONSORED"],
      },
      {
        label: "Cancelled plans",
        value: subscriptionMetrics?.totals.cancelledAccounts ?? null,
        helper: "Supervisors that churned or paused billing",
        filters: ["CANCELLED"],
      },
    ],
    [subscriptionMetrics]
  );

  useEffect(() => {
    if (!users || !selectedUser) return;
    const refreshed = users.find((user) => user.id === selectedUser.id);
    if (refreshed) setSelectedUser(refreshed);
  }, [users, selectedUser]);

  const roles = useMemo(() => Object.keys(ROLE_DESCRIPTIONS), []);

  const subscriptionListUsers = useMemo(() => {
    if (!activeSubscriptionList || !users) return [];
    return users
      .filter(
        (user) =>
          user.subscriptionType &&
          activeSubscriptionList.filters.includes(user.subscriptionType)
      )
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [activeSubscriptionList, users]);

  const isUserDirectoryLoading = !users;

  const updateRole = async (userId: number, role: string) => {
    setLoadingRole(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      toast.success("User role updated");
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Unable to update role");
    } finally {
      setLoadingRole(null);
    }
  };

  const updateSubscription = async (userId: number, subscriptionType: string) => {
    setLoadingSubscription(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subscriptionType }),
      });
      if (!res.ok) throw new Error("Failed to update subscription");
      toast.success("Subscription updated");
      setSelectedUser((current) => {
        if (!current || current.id !== userId) return current;
        return {
          ...current,
          subscriptionType,
          subscriptionExpiresAt: subscriptionType === "ADMIN_APPROVED" ? null : current.subscriptionExpiresAt,
        };
      });
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Unable to update subscription");
    } finally {
      setLoadingSubscription(null);
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setLoadingInvite(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: inviteName.trim(), role: inviteRole }),
      });
      if (!res.ok) throw new Error("Failed to send invitation");
      toast.success("Invitation sent");
      setInviteEmail("");
      setInviteName("");
    } catch (err: any) {
      toast.error(err?.message || "Unable to send invite");
    } finally {
      setLoadingInvite(false);
    }
  };

  return (
    <Layout title="Admin Dashboard">
      <div className="space-y-8">
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <h1 className="flex items-center gap-3 text-2xl font-semibold text-gray-900">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
            <span>Admin Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-blue-900">
            Manage users, invitations, and account settings across the entire ProjectDesk workspace.
          </p>
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Manage users & roles</h2>
          </div>
          <UserLookup
            onSelect={(option) => {
              const full = users?.find((user) => user.id === option.id);
              if (full) {
                setSelectedUser(full);
              } else {
                setSelectedUser({ ...option, emailVerified: null });
              }
            }}
          />
          {selectedUser && (
            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-gray-900">
                  {selectedUser.name || selectedUser.email}
                </span>
                <span className="text-xs text-gray-600">{selectedUser.email}</span>
                <span className="text-xs text-gray-500">
                  Verified: {selectedUser.emailVerified ? new Date(selectedUser.emailVerified).toLocaleString() : "—"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                    Role
                    <button
                      type="button"
                      onClick={() => setShowRoleInfo(true)}
                      className="text-gray-400 hover:text-gray-600 transition"
                      aria-label="View role permissions"
                    >
                      <QuestionMarkCircleIcon className="h-4 w-4" />
                    </button>
                  </span>
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value={selectedUser.role}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedUser({ ...selectedUser, role: value });
                      updateRole(selectedUser.id, value);
                    }}
                    disabled={loadingRole === selectedUser.id}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                  <span>Subscription</span>
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-900"
                    value={selectedUser.subscriptionType ?? ""}
                    onChange={(e) => updateSubscription(selectedUser.id, e.target.value)}
                    disabled={loadingSubscription === selectedUser.id}
                  >
                    {subscriptionOptions.map((type) => (
                      <option key={type} value={type}>
                        {titleCase(type)}
                      </option>
                    ))}
                  </select>
                  {selectedUser.subscriptionExpiresAt && (
                    <span className="text-[11px] font-normal text-gray-500">
                      Expires {formatDate(selectedUser.subscriptionExpiresAt)}
                    </span>
                  )}
                  <span className="text-[11px] font-normal text-gray-500">
                    Toggle admin-approved access or revert to other billing states here.
                  </span>
                </label>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-gray-600">Actions</span>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const name = prompt("Update name", selectedUser.name || "");
                        if (name === null) return;
                        const email = prompt("Update email", selectedUser.email);
                        if (!email) {
                          toast.error("Email is required");
                          return;
                        }
                        try {
                          const res = await fetch("/api/admin/users", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              userId: selectedUser.id,
                              name: name.trim() || null,
                              email: email.trim(),
                              role: selectedUser.role,
                            }),
                          });
                          if (!res.ok) throw new Error("Failed to update user");
                          toast.success("User details updated");
                          mutate();
                        } catch (err: any) {
                          toast.error(err?.message || "Unable to update user");
                        }
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-white"
                    >
                      Edit details
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/admin/password-reset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: selectedUser.id }),
                          });
                          if (!res.ok) throw new Error("Failed to send password reset");
                          toast.success("Password reset email sent");
                        } catch (err: any) {
                          toast.error(err?.message || "Unable to send password reset");
                        }
                      }}
                      className="rounded-md border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                    >
                      Send password reset
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedUser) return;
                        const confirmed = window.confirm(
                          "Delete this user? Their comments, notifications, and memberships will be removed. This cannot be undone."
                        );
                        if (!confirmed) return;
                        setDeletingUserId(selectedUser.id);
                        try {
                          const res = await fetch("/api/admin/users", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: selectedUser.id }),
                          });
                          const payload = await res.json();
                          if (!res.ok) {
                            throw new Error(payload?.error || "Failed to delete user");
                          }
                          toast.success("User deleted");
                          setSelectedUser(null);
                          mutate();
                        } catch (err: any) {
                          toast.error(err?.message || "Unable to delete user");
                        } finally {
                          setDeletingUserId(null);
                        }
                      }}
                      disabled={deletingUserId === selectedUser.id}
                      className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingUserId === selectedUser.id ? "Deleting..." : "Delete user"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <UserPlus className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Invite a user</h2>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Name (optional)"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              <input
                type="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                onClick={sendInvite}
                disabled={loadingInvite}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loadingInvite ? "Sending..." : "Send invitation"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Subscription & billing</h2>
                <p className="text-xs text-gray-500">Workspace-wide billing pulse updated every few minutes.</p>
              </div>
            </div>
            <span className="text-xs text-gray-500">Live data</span>
          </div>
          {subscriptionMetrics ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {summaryCards.map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => setActiveSubscriptionList(card)}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-blue-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">
                      {typeof card.value === "number" ? card.value.toLocaleString() : "—"}
                    </p>
                    <p className="text-xs text-gray-600">{card.helper}</p>
                    <p className="mt-3 text-xs font-semibold text-blue-600">
                      View list
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Trials ending soon</p>
                      <p className="text-xs text-gray-500">Next 7 days</p>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
                      {subscriptionMetrics.freeTrialsEndingSoon.length}{" "}
                      {subscriptionMetrics.freeTrialsEndingSoon.length === 1 ? "account" : "accounts"}
                    </span>
                  </div>
                  {subscriptionMetrics.freeTrialsEndingSoon.length ? (
                    <ul className="mt-4 space-y-3">
                      {subscriptionMetrics.freeTrialsEndingSoon.map((trial) => (
                        <li key={trial.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                          <p className="text-sm font-semibold text-gray-900">{trial.name || trial.email}</p>
                          <p className="text-xs text-gray-600">{trial.email}</p>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="text-gray-500">Ends {formatDate(trial.subscriptionExpiresAt)}</span>
                            <span
                              className={
                                trial.daysRemaining !== null && trial.daysRemaining <= 2
                                  ? "text-red-600 font-semibold"
                                  : "text-gray-700"
                              }
                            >
                              {formatDaysRemaining(trial.daysRemaining)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500">No free trials ending within the next week.</p>
                  )}
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-2 text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-semibold">Billing alerts</p>
                      <p className="text-xs text-amber-800">Follow up with supervisors or sponsors that need attention.</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-amber-700">Cancelled supervisors</p>
                      {subscriptionMetrics.cancelledSupervisors.length ? (
                        <ul className="mt-2 space-y-2">
                          {subscriptionMetrics.cancelledSupervisors.map((entry) => (
                            <li key={entry.id} className="rounded-md border border-amber-100 bg-white/80 p-3">
                              <p className="text-sm font-semibold text-gray-900">{entry.name || entry.email}</p>
                              <p className="text-xs text-gray-600">{entry.email}</p>
                              <span className="mt-1 inline-block text-xs text-amber-800">
                                Status: {titleCase(entry.goCardlessSubscriptionStatus)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-amber-800">No cancelled supervisors right now.</p>
                      )}
                    </div>
                    <div className="border-t border-amber-100 pt-4">
                      <p className="text-xs uppercase tracking-wide text-amber-700">Sponsored users without coverage</p>
                      <p className="text-sm font-semibold text-amber-900">
                        {subscriptionMetrics.sponsorAlerts.impactedCount} impacted
                      </p>
                      {subscriptionMetrics.sponsorAlerts.users.length ? (
                        <ul className="mt-2 space-y-2">
                          {subscriptionMetrics.sponsorAlerts.users.map((user) => (
                            <li key={user.id} className="rounded-md border border-amber-100 bg-white/80 p-3">
                              <p className="text-sm font-semibold text-gray-900">
                                {user.name || user.email}
                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-700">
                                  {user.role}
                                </span>
                              </p>
                              <p className="text-xs text-gray-600">{user.email}</p>
                              <p className="text-xs text-gray-500">
                                Sponsor: {user.sponsorName || user.sponsorEmail || "Unknown"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-amber-800">All sponsored users are covered.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-lg border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">GoCardless status</p>
                {subscriptionMetrics.goCardlessStatusCounts.length ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {subscriptionMetrics.goCardlessStatusCounts.map((entry) => (
                      <div key={entry.status} className="rounded-md border border-gray-100 bg-white p-3">
                        <p className="text-xs uppercase text-gray-500">Status</p>
                        <p className="text-base font-semibold text-gray-900">{titleCase(entry.status)}</p>
                        <p className="text-sm text-gray-600">
                          {entry.count} account{entry.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">No GoCardless subscriptions are active yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Gathering live subscription metrics…
            </div>
          )}
        </section>
      </div>
      {activeSubscriptionList && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {activeSubscriptionList.label}
                </h3>
                <p className="text-sm text-gray-600">
                  {isUserDirectoryLoading
                    ? "Loading user list…"
                    : `${subscriptionListUsers.length} user${
                        subscriptionListUsers.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubscriptionList(null)}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
              {isUserDirectoryLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Fetching directory…
                </p>
              ) : subscriptionListUsers.length ? (
                subscriptionListUsers.map((user) => (
                  <div key={user.id} className="py-3">
                    <p className="font-medium text-gray-900">
                      {user.name || user.email}
                    </p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <p className="text-xs text-gray-500">
                      Role: {user.role} • Subscription: {titleCase(user.subscriptionType)}
                      {user.subscriptionExpiresAt && (
                        <>
                          {" "}
                          • Expires {formatDate(user.subscriptionExpiresAt)}
                        </>
                      )}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">
                  No users match this status right now.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {showRoleInfo && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Role permissions</h3>
            <p className="mt-1 text-sm text-gray-600">Quick reference for what each ProjectDesk role can do.</p>
            <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-2">
              {roles.map((role) => (
                <div key={role}>
                  <p className="text-sm font-semibold text-gray-900">{role}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-gray-600">
                    {ROLE_DESCRIPTIONS[role].map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRoleInfo(false)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster position="bottom-right" />
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
