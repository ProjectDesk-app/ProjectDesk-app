import Link from "next/link";
import { useRouter } from "next/router";

export function EmailNavigation() {
  const router = useRouter();
  return <nav aria-label="Email Centre" className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
    {[{ href: "/admin/email-templates", label: "Templates" }, { href: "/admin/email-test", label: "Test delivery" }, { href: "/admin/email-logs", label: "Delivery logs" }].map(item => <Link key={item.href} href={item.href} aria-current={router.pathname === item.href ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium ${router.pathname === item.href ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>{item.label}</Link>)}
  </nav>;
}
