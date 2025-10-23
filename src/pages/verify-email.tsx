import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "@/components/Layout";

type Status = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const verify = async () => {
      if (!token || typeof token !== "string") return;
      setStatus("loading");
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || "Could not verify email");
        }
        setMessage(payload?.message || "Email verified!");
        setStatus("success");
      } catch (err: any) {
        setMessage(err?.message || "Could not verify email");
        setStatus("error");
      }
    };

    verify();
  }, [token]);

  return (
    <Layout title="Verify email">
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Email verification</h1>
        {status === "loading" && <p className="text-gray-600">Confirming your email…</p>}
        {status !== "loading" && (
          <p className={status === "success" ? "text-green-600" : "text-red-600"}>{message}</p>
        )}
        <div className="flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Return to home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </Layout>
  );
}
