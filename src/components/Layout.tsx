import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, Fragment, useMemo } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { Menu, Transition } from "@headlessui/react";
import { BellIcon, ChevronDownIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { LayoutDashboard, GraduationCap, Layers, ShieldCheck } from "lucide-react";

import Logo from "@/assets/branding/ProjectDesk-Transparent.png";
import { ProfileOverviewModal } from "@/components/account/ProfileOverviewModal";
import { EditNameModal } from "@/components/account/EditNameModal";
import { ChangeEmailModal } from "@/components/account/ChangeEmailModal";
import { ChangePasswordModal } from "@/components/account/ChangePasswordModal";
import { SupportTicketModal } from "@/components/account/SupportTicketModal";

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

  return (
    <div>
      <Head>
        <title>{title ? `${title} • ProjectDesk` : "ProjectDesk"}</title>
        <link rel="icon" type="image/png" href="/branding/favicon.png" />
      </Head>
      <header className="border-b bg-white/75 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src={Logo} alt="ProjectDesk" className="h-8 w-auto" priority />
            <span className="sr-only">ProjectDesk home</span>
          </Link>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              {allowedNavItems.length > 0 && (
                <nav className="hidden md:flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-2 py-1 shadow-sm">
                  {allowedNavItems.map(({ label, href, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition"
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      <span>{label}</span>
                    </Link>
                  ))}
                </nav>
              )}

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
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
                className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-100 transition"
              >
                Sign in
              </button>
              <Link
                href="/signup"
                className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

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
        </>
      )}
    </div>
  );
}
  const handleSignOut = () => {
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "";
    signOut({
      callbackUrl: origin ? `${origin}/` : "/",
    });
  };
