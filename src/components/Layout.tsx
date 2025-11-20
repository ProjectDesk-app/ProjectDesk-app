import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, Fragment, useMemo } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { Menu, Transition } from "@headlessui/react";
import { BellIcon, ChevronDownIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { LayoutDashboard, GraduationCap, Layers, ShieldCheck, CreditCard, AlertTriangle } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

import Logo from "@/assets/branding/ProjectDesk-Transparent.png";
import { ProfileOverviewModal } from "@/components/account/ProfileOverviewModal";
import { EditNameModal } from "@/components/account/EditNameModal";
import { ChangeEmailModal } from "@/components/account/ChangeEmailModal";
import { ChangePasswordModal } from "@/components/account/ChangePasswordModal";
import { SupportTicketModal } from "@/components/account/SupportTicketModal";
import { FeedbackWidget } from "@/components/account/FeedbackWidget";
import { canSponsorAccounts } from "@/lib/subscriptions";
import type { SubscriptionType } from "@prisma/client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AccountModalType = "profile" | "name" | "email" | "password" | "support";

export default function Layout({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeModal, setActiveModal] = useState<AccountModalType | null>(null);
  const [showSponsorDetails, setShowSponsorDetails] = useState(false);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [notifyingSponsor, setNotifyingSponsor] = useState(false);
  const userRole = (session?.user as any)?.role;
  const isAuthenticated = Boolean(session);

  const navItems = useMemo(
    () => [
      {
        label: "Dashboard",
        href: "/dashboard",
        roles: undefined,
        icon: LayoutDashboard,
      },
      {
        label: "Support Hub",
        href: "/assistance",
        roles: ["SUPERVISOR", "ADMIN"],
        icon: GraduationCap,
      },
      {
        label: "Supervisor",
        href: "/supervisor",
        roles: ["SUPERVISOR", "ADMIN"],
        icon: CreditCard,
      },
      {
        label: "Task Library",
        href: "/supervisor/task-library",
        roles: ["SUPERVISOR", "ADMIN"],
        icon: Layers,
      },
      {
        label: "Admin",
        href: "/admin",
        roles: ["ADMIN"],
        icon: ShieldCheck,
      },
    ],
    []
  );

  const allowedNavItems = navItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );

  const { data: accountProfile, mutate: mutateAccountProfile } = useSWR(
    session ? "/api/account/profile" : null,
    fetcher
  );

  const fetchUnreadCount = async () => {
    if (!session) {
      setUnreadCount(0);
      return;
    }
    try {
      const data = await fetcher("/api/notifications/unread-count");
      setUnreadCount(data?.unreadCount || 0);
    } catch {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchUnreadCount();

    router.events.on("routeChangeComplete", fetchUnreadCount);
    return () => {
      router.events.off("routeChangeComplete", fetchUnreadCount);
    };
  }, [router.events, session]);

  const menuItemClass = (active: boolean, extra = "") =>
    `${extra} block w-full text-left px-4 py-2 text-sm ${
      active ? "bg-gray-100 text-gray-900" : "text-gray-700"
    }`;

  const pendingEmail = accountProfile?.pendingEmail || null;
  const sponsorSubscriptionType = accountProfile?.sponsor?.subscriptionType as SubscriptionType | undefined;
  const inactiveSponsorWarning =
    accountProfile?.subscriptionType === "SPONSORED" &&
    sponsorSubscriptionType &&
    !canSponsorAccounts(sponsorSubscriptionType);

  const closeModal = () => setActiveModal(null);

  const updateProfileOptimistic = (updater: (prev: any) => any) => {
    mutateAccountProfile(updater, { revalidate: true });
  };

  const handleSignOut = () => {
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "";
    signOut({
      callbackUrl: origin ? `${origin}/` : "/",
    });
  };

  const sponsorSubscriptionInactive =
    accountProfile?.role &&
    (accountProfile.role === "STUDENT" || accountProfile.role === "COLLABORATOR") &&
    accountProfile.sponsorSubscriptionInactive;

  const supervisorSubscriptionCancelled = Boolean(
    (accountProfile?.role === "SUPERVISOR" && accountProfile?.subscriptionType === "CANCELLED") ||
      ((session?.user as any)?.role === "SUPERVISOR" &&
        (session?.user as any)?.subscriptionType === "CANCELLED")
  );

  const sponsorContactLabel =
    accountProfile?.sponsor?.name && accountProfile?.sponsor?.email
      ? `${accountProfile.sponsor.name} (${accountProfile.sponsor.email})`
      : accountProfile?.sponsor?.email || accountProfile?.sponsor?.name || "your supervisor";
  const sponsorEmail = accountProfile?.sponsor?.email || null;

  useEffect(() => {
    if (!sponsorSubscriptionInactive) {
      setShowSponsorDetails(false);
    }
  }, [sponsorSubscriptionInactive]);

  const handleManageSubscription = async () => {
    if (managingSubscription) return;
    setManagingSubscription(true);
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
    } catch (error: any) {
      toast.error(error?.message || "Unable to manage subscription");
    } finally {
      setManagingSubscription(false);
    }
  };

  const handleNotifySponsor = async () => {
    if (!sponsorEmail || notifyingSponsor) return;
    const confirmed = window.confirm(
      `Send an email to ${sponsorEmail} letting them know you tried to sign in but their subscription is inactive?`
    );
    if (!confirmed) return;
    setNotifyingSponsor(true);
    try {
      const res = await fetch("/api/account/notify-sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to notify sponsor");
      }
      toast.success("Sponsor notified");
    } catch (error: any) {
      toast.error(error?.message || "Unable to notify sponsor");
    } finally {
      setNotifyingSponsor(false);
    }
  };

  return (
    <div>
      <Head>
        <title>{title ? `${title} • ProjectDesk` : "ProjectDesk"}</title>
        <link rel="icon" type="image/png" href="/branding/favicon.png" />
      </Head>
      <header className="border-b bg-white/75 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src={Logo} alt="ProjectDesk" className="h-8 w-auto" priority />
            <span className="sr-only">ProjectDesk home</span>
          </Link>
          {isAuthenticated && allowedNavItems.length > 0 && (
            <nav
              className="flex w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white/90 px-2 py-1 text-sm shadow-sm sm:w-auto"
              aria-label="Primary"
            >
              {allowedNavItems.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition"
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/notifications" className="relative">
                  <BellIcon className="h-5 w-5 text-gray-700 hover:text-blue-600 transition" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Link>

                <Menu as="div" className="relative">
                  <Menu.Button className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100">
                    <UserCircleIcon className="h-5 w-5" />
                    <span>My Account</span>
                    <ChevronDownIcon className="h-4 w-4" />
                  </Menu.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-40 mt-2 w-56 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={menuItemClass(active)}
                          onClick={() => setActiveModal("profile")}
                        >
                          Profile overview
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={menuItemClass(active)}
                          onClick={() => setActiveModal("name")}
                        >
                          Edit name
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={menuItemClass(active)}
                          onClick={() => setActiveModal("email")}
                        >
                          Change email
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={menuItemClass(active)}
                          onClick={() => setActiveModal("password")}
                        >
                          Change password
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={menuItemClass(active)}
                          onClick={() => setActiveModal("support")}
                        >
                          Get help
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={menuItemClass(active, "border-t border-gray-100")}
                          onClick={handleSignOut}
                        >
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Transition>
              </Menu>
              </>
            ) : (
              <>
                <button
                  onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
                  className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Sign in
                </button>
                <Link
                  href="/signup"
                  className="rounded-full border border-blue-600 px-4 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {isAuthenticated && inactiveSponsorWarning && (
        <div className="bg-amber-100 border-b border-amber-200">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3 text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">
                Your sponsor’s subscription is inactive.
              </p>
              <p>
                Please contact your supervisor or request a new sponsor to maintain access to ProjectDesk.
              </p>
            </div>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      <Toaster position="bottom-right" />

      {supervisorSubscriptionCancelled && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 text-left shadow-xl">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Subscription inactive</h2>
              <p className="text-sm text-gray-700">
                Your ProjectDesk subscription is cancelled, so sponsoring collaborators and project tools are paused.
                Use the button below to manage your subscription with GoCardless.
              </p>
            </div>
            <div className="space-y-2 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">How to fix this</p>
              <p>Restart the plan, update payment details, or approve the latest mandate from the GoCardless portal.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleManageSubscription}
                disabled={managingSubscription}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {managingSubscription ? "Opening GoCardless..." : "Manage subscription"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Sign out
              </button>
              <a
                href="https://projectdesk.app/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
              >
                Contact support
              </a>
            </div>
            <p className="text-xs text-gray-500">
              Once billing is active again, refresh this page to regain full access. Sponsored users unlock automatically.
            </p>
          </div>
        </div>
      )}

      {sponsorSubscriptionInactive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 text-left shadow-xl">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Sponsor subscription inactive</h2>
              <p className="text-sm text-gray-700">
                Your ProjectDesk access is paused because {sponsorContactLabel}&rsquo;s subscription is inactive.
                Please resolve the sponsorship before continuing.
              </p>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowSponsorDetails((value) => !value)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                {showSponsorDetails ? "Hide details" : "Show more detail"}
              </button>
              {showSponsorDetails && (
                <div className="space-y-3 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">How to regain access</p>
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      <span className="font-semibold text-gray-900">Speak with your current sponsor.</span>{" "}
                      Ask them to restart their ProjectDesk subscription so your sponsorship can resume.
                    </li>
                    <li>
                      <span className="font-semibold text-gray-900">Seek a new sponsor if needed.</span>{" "}
                      A supervisor with an active subscription can add you from their Supervisor Dashboard using your email.
                    </li>
                  </ol>
                  <p className="text-xs text-gray-500">
                    Once a sponsor&rsquo;s subscription becomes active, your access unlocks automatically.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2 rounded-md bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Access is temporarily locked</p>
              <p>
                You can review this message and sign out, but ProjectDesk features stay disabled until a sponsor with an
                active subscription adds you again.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Sign out
              </button>
              {sponsorEmail && (
                <button
                  type="button"
                  onClick={handleNotifySponsor}
                  disabled={notifyingSponsor}
                  className="rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                >
                  {notifyingSponsor ? "Sending..." : "Notify sponsor"}
                </button>
              )}
              <a
                href="https://projectdesk.app/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
              >
                Contact support
              </a>
            </div>
          </div>
        </div>
      )}

      {session && (
        <>
          <ProfileOverviewModal
            open={activeModal === "profile"}
            onClose={closeModal}
            profile={accountProfile}
          />
          <EditNameModal
            open={activeModal === "name"}
            onClose={closeModal}
            initialName={accountProfile?.name ?? null}
            onUpdated={(name) => {
              updateProfileOptimistic((prev: any) => (prev ? { ...prev, name } : prev));
              closeModal();
            }}
          />
          <ChangeEmailModal
            open={activeModal === "email"}
            onClose={closeModal}
            currentEmail={accountProfile?.email ?? session.user?.email ?? null}
            pendingEmail={pendingEmail}
            onRequested={(newEmail) => {
              updateProfileOptimistic((prev: any) =>
                prev ? { ...prev, pendingEmail: newEmail } : prev
              );
            }}
          />
          <ChangePasswordModal
            open={activeModal === "password"}
            onClose={closeModal}
          />
          <SupportTicketModal
            open={activeModal === "support"}
            onClose={closeModal}
            profile={accountProfile}
            sessionUser={session.user}
          />
          <FeedbackWidget profile={accountProfile} sessionUser={session.user} />
        </>
      )}
    </div>
  );
}
