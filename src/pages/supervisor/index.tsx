import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Layout from "@/components/Layout";
import { CreditCard, Users, UserMinus } from "lucide-react";
import { toast, Toaster } from "react-hot-toast";
import { UserLookup } from "@/components/admin/UserLookup";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canSponsorAccounts } from "@/lib/subscriptions";
import { SubscriptionType } from "@prisma/client";

type SubscriptionResponse = {
  subscriptionType: SubscriptionType;
  subscriptionStartedAt: string;
  subscriptionExpiresAt: string | null;
  sponsoredCount: number;
  sponsorLimit: number;
  sponsorSlotsRemaining: number;
  canSponsor: boolean;
  trialDaysRemaining: number | null;
  trialExpired: boolean;
  isCancelled: boolean;
  goCardlessSubscriptionId: string | null;
  goCardlessSubscriptionStatus: string | null;
};

type SponsoredUser = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  subscriptionType: SubscriptionType;
  subscriptionStartedAt: string;
  subscriptionExpiresAt: string | null;
};

type SponsorRequest = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  subscriptionStartedAt: string;
};

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return res.json();
});

const subscriptionLabel = (value?: SubscriptionType) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Unknown";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
};

export default function SupervisorDashboard() {
  const { data: subscriptionData, mutate: mutateSubscription } = useSWR<SubscriptionResponse>(
    "/api/supervisor/subscription",
    fetcher
  );
  const {
    data: sponsoredData,
    mutate: mutateSponsored,
    isLoading: sponsoredLoading,
  } = useSWR<{ sponsored: SponsoredUser[]; requests: SponsorRequest[] }>(
    "/api/supervisor/sponsored",
    fetcher
  );

  const [isAssigning, setIsAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [startingSubscription, setStartingSubscription] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showManageSubscription, setShowManageSubscription] = useState(false);

  const sponsoredUsers = sponsoredData?.sponsored ?? [];
  const pendingRequests = sponsoredData?.requests ?? [];
  const isFreeTrial = subscriptionData?.subscriptionType === SubscriptionType.FREE_TRIAL;
  const canAddMore =
    subscriptionData?.canSponsor &&
    (subscriptionData?.sponsorSlotsRemaining ?? 0) > 0 &&
    !subscriptionData?.trialExpired &&
    !subscriptionData?.isCancelled;

  const subscriptionSummary = useMemo(() => {
    if (!subscriptionData) return null;
    const base = subscriptionLabel(subscriptionData.subscriptionType);
    if (subscriptionData.subscriptionType === SubscriptionType.FREE_TRIAL) {
      if (subscriptionData.trialExpired) return `${base} (expired)`;
      if (typeof subscriptionData.trialDaysRemaining === "number") {
        return `${base} (${subscriptionData.trialDaysRemaining} day${
          subscriptionData.trialDaysRemaining === 1 ? "" : "s"
        } remaining)`;
      }
    }
    return base;
  }, [subscriptionData]);

  const hasActiveSubscription =
    !!subscriptionData &&
    subscriptionData.subscriptionType === SubscriptionType.SUBSCRIBED &&
    !!subscriptionData.goCardlessSubscriptionId &&
    !subscriptionData.isCancelled;

  useEffect(() => {
    if (!hasActiveSubscription) {
      setShowManageSubscription(false);
    }
  }, [hasActiveSubscription]);

  const sponsorUser = async (userId: number, displayName: string | null, displayEmail: string) => {
    const res = await fetch("/api/supervisor/sponsored", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => null);
      throw new Error(error?.error || "Unable to sponsor account");
    }
    toast.success(`${displayName || displayEmail} is now sponsored`);
    mutateSponsored();
    mutateSubscription();
  };

  const handleAssignSponsor = async (option: { id: number; email: string; name: string | null; role: string }) => {
    if (!subscriptionData) return;

    setIsAssigning(true);
    try {
      await sponsorUser(option.id, option.name, option.email);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update sponsor");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleApproveRequest = async (request: SponsorRequest) => {
    setApprovingId(request.id);
    try {
      await sponsorUser(request.id, request.name, request.email);
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve request");
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeclineRequest = async (request: SponsorRequest) => {
    setDecliningId(request.id);
    try {
      const res = await fetch(`/api/supervisor/requests/${request.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Unable to decline request");
      }
      toast.success(`${request.name || request.email} request declined`);
      mutateSponsored();
    } catch (err: any) {
      toast.error(err?.message || "Failed to decline request");
    } finally {
      setDecliningId(null);
    }
  };

  const handleRemoveSponsor = async (user: SponsoredUser) => {
    setRemovingId(user.id);
    try {
      const res = await fetch(`/api/supervisor/sponsored/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Unable to remove sponsorship");
      }
      toast.success(`${user.name || user.email} sponsorship removed`);
      mutateSponsored();
      mutateSubscription();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove sponsorship");
    } finally {
      setRemovingId(null);
    }
  };

  const startSubscription = async () => {
    setStartingSubscription(true);
    try {
      const res = await fetch("/api/supervisor/subscription/manage", {
        method: "POST",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to start subscription");
      }
      const redirectUrl = payload?.redirectUrl;
      if (!redirectUrl) {
        throw new Error("No redirect URL returned");
      }
      window.location.href = redirectUrl;
    } catch (err: any) {
      toast.error(err?.message || "Unable to start subscription");
    } finally {
      setStartingSubscription(false);
    }
  };

  const cancelSubscription = async () => {
    setCancellingSubscription(true);
    try {
      const res = await fetch("/api/supervisor/subscription/manage", {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to cancel subscription");
      }
      toast.success("Subscription cancelled");
      mutateSubscription();
      mutateSponsored();
    } catch (err: any) {
      toast.error(err?.message || "Unable to cancel subscription");
    } finally {
      setCancellingSubscription(false);
      setShowManageSubscription(false);
    }
  };

  return (
    <Layout title="Supervisor Dashboard">
      <div className="space-y-6">
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <h1 className="flex items-center gap-3 text-2xl font-semibold text-gray-900">
            <CreditCard className="h-7 w-7 text-blue-600" />
            <span>Supervisor Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-blue-900">
            Monitor your subscription and manage the collaborators and students you sponsor across ProjectDesk.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Subscription overview</h2>
            </div>
            {subscriptionData ? (
              <>
                <dl className="space-y-2 text-sm text-gray-700">
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-900">Plan</dt>
                    <dd>{subscriptionSummary}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-900">Since</dt>
                    <dd>{formatDate(subscriptionData.subscriptionStartedAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-900">Access until</dt>
                    <dd>{formatDate(subscriptionData.subscriptionExpiresAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-900">Sponsored accounts</dt>
                    <dd>
                      {subscriptionData.sponsoredCount} / {subscriptionData.sponsorLimit}
                    </dd>
                  </div>
                  {subscriptionData.goCardlessSubscriptionStatus && (
                    <div className="flex items-center justify-between">
                      <dt className="font-medium text-gray-900">Latest billing status</dt>
                      <dd className="text-xs uppercase tracking-wide text-gray-600">
                        {subscriptionData.goCardlessSubscriptionStatus}
                      </dd>
                    </div>
                  )}
                  {!subscriptionData.canSponsor && (
                    <p className="mt-3 rounded-md bg-yellow-100 px-3 py-2 text-xs font-medium text-yellow-800">
                      Upgrade to a paid subscription to sponsor collaborators and students.
                    </p>
                  )}
                  {subscriptionData.trialExpired && (
                    <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs font-medium text-red-700">
                      Your trial has ended. Start a subscription to continue using ProjectDesk.
                    </p>
                  )}
                  {subscriptionData.isCancelled && (
                    <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs font-medium text-red-700">
                      Your subscription is cancelled. Renew to restore sponsorship access and sign in for collaborators.
                    </p>
                  )}
                </dl>

                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasActiveSubscription) {
                        setShowManageSubscription((value) => !value);
                      } else {
                        startSubscription();
                      }
                    }}
                    disabled={startingSubscription || cancellingSubscription}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {hasActiveSubscription
                      ? showManageSubscription
                        ? "Hide subscription actions"
                        : "Manage subscription"
                      : startingSubscription
                      ? "Starting..."
                      : "Start subscription"}
                  </button>
                  {showManageSubscription && hasActiveSubscription && (
                    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-900">Subscription details</p>
                        <p className="text-xs text-gray-600">
                          Subscription ID:{" "}
                          <span className="select-all font-mono text-xs">
                            {subscriptionData.goCardlessSubscriptionId}
                          </span>
                        </p>
                        {subscriptionData.goCardlessSubscriptionStatus && (
                          <p className="text-xs text-gray-600">
                            Status: {subscriptionData.goCardlessSubscriptionStatus}
                          </p>
                        )}
                      </div>
                      <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                        Cancelling ends your paid plan and pauses sponsored access after the current billing period.
                      </p>
                      <button
                        type="button"
                        onClick={() => cancelSubscription()}
                        disabled={cancellingSubscription}
                        className="w-full rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        {cancellingSubscription ? "Cancelling..." : "Cancel subscription"}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Loading subscription details…</p>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Add sponsored accounts</h2>
            </div>
            <p className="text-sm text-gray-600">
              Sponsor students or collaborators so they can access your projects without paying for their own
              subscription.
            </p>
            <div className="mt-4 space-y-3">
              {subscriptionData && isFreeTrial && !subscriptionData.trialExpired && (
                <p className="rounded-md bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
                  Sponsorships are disabled while you are on a Free Trial. Start a subscription to invite others.
                </p>
              )}
              {subscriptionData?.isCancelled && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  Your subscription is cancelled. Renew your plan before adding new sponsored accounts.
                </p>
              )}
              {subscriptionData && subscriptionData.sponsorSlotsRemaining === 0 && (
                <p className="rounded-md bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
                  You have reached the sponsorship limit. Remove an existing sponsored account or contact support to
                  upgrade.
                </p>
              )}
              <UserLookup
                onSelect={(option) => {
                  if (!canAddMore) {
                    toast.error("You cannot sponsor additional accounts right now.");
                    return;
                  }
                  handleAssignSponsor(option);
                }}
              />
              {isAssigning && <p className="text-xs text-gray-500">Assigning sponsorship…</p>}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Sponsored accounts</h2>
            </div>
            <span className="text-xs font-medium text-gray-500">
              {subscriptionData?.sponsoredCount ?? sponsoredUsers.length} active
            </span>
          </div>

          {pendingRequests.length > 0 && (
            <div className="mb-6 space-y-3 rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-yellow-900">
                  Pending sponsorship requests ({pendingRequests.length})
                </p>
                <span className="text-xs text-yellow-800">
                  Review and approve to grant access.
                </span>
              </div>
              <ul className="space-y-2 text-sm text-yellow-900">
                {pendingRequests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-yellow-200 bg-yellow-100 px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{request.name || request.email}</span>
                      <span className="text-xs text-gray-600">{request.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveRequest(request)}
                        disabled={approvingId === request.id}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {approvingId === request.id ? "Approving…" : "Approve"}
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(request)}
                        disabled={decliningId === request.id}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {decliningId === request.id ? "Declining…" : "Decline"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sponsoredLoading ? (
            <p className="text-sm text-gray-500">Loading sponsored accounts…</p>
          ) : sponsoredUsers.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              No sponsored accounts yet. Use the search above to add collaborators or students.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sponsoredUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{user.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="px-4 py-3 text-gray-600">{user.role}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {subscriptionLabel(user.subscriptionType)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemoveSponsor(user)}
                          disabled={removingId === user.id}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          <UserMinus className="h-4 w-4" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <Toaster position="bottom-right" />
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const role = (session?.user as any)?.role;

  if (!session || (role !== "SUPERVISOR" && role !== "ADMIN")) {
    return {
      redirect: {
        destination: "/api/auth/signin",
        permanent: false,
      },
    };
  }

  return { props: {} };
};
