import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { toast, Toaster } from "react-hot-toast";
import { ShieldCheck, Users, UserPlus, CreditCard } from "lucide-react";
import { UserLookup } from "@/components/admin/UserLookup";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type UserRow = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  emailVerified?: string | null;
};

const ROLE_DESCRIPTIONS: Record<string, string[]> = {
  ADMIN: ["View and manage all projects", "Manage users and billing", "Send invitations"],
  SUPERVISOR: ["Create and manage own projects", "Assign tasks", "Monitor student progress"],
  STUDENT: ["View assigned projects", "Update task progress", "Collaborate via comments"],
  COLLABORATOR: ["Assist on shared tasks", "Leave updates and comments"],
};

export default function AdminDashboard() {
  const { data: users, mutate } = useSWR<UserRow[]>("/api/admin/users", fetcher);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("STUDENT");
  const [loadingRole, setLoadingRole] = useState<number | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  useEffect(() => {
    if (!users || !selectedUser) return;
    const refreshed = users.find((user) => user.id === selectedUser.id);
    if (refreshed) setSelectedUser(refreshed);
  }, [users, selectedUser]);

  const roles = useMemo(() => Object.keys(ROLE_DESCRIPTIONS), []);

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
                  Role
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
                <div className="flex flex-col gap-1">
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
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Role permissions</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((role) => (
              <div key={role} className="space-y-2 rounded-md border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">{role}</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
                  {ROLE_DESCRIPTIONS[role].map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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
          <div className="mb-4 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Subscription & billing</h2>
          </div>
          <p className="text-sm text-gray-600">
            Subscription controls will appear here when billing is enabled. In the meantime, you can keep
            track of customer plans, invoices, and payment methods from this space.
          </p>
          <div className="mt-4 rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            Coming soon: plan management, invoice history, usage metrics, and payment integrations.
          </div>
        </section>
      </div>
      <Toaster position="bottom-right" />
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") {
    return {
      redirect: {
        destination: "/api/auth/signin",
        permanent: false,
      },
    };
  }

  return { props: {} };
};
