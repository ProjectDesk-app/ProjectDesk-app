import { useRouter } from "next/router";
import { useRef, useState } from "react";
import Link from "next/link";
import Layout from "@/components/Layout";

type Status = "idle" | "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const handledRef = useRef(false);

  async function verify() {
    if (handledRef.current || !router.isReady || typeof token !== "string" || !token) return;
    handledRef.current = true;
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Could not verify email");
      setMessage(payload?.message || "Email verified!");
      setStatus("success");
    } catch (err: any) {
      setMessage(err?.message || "Could not verify email");
      setStatus("error");
      handledRef.current = false;
    }
  }
  const validToken = typeof token === "string" && Boolean(token);

  return (
    <Layout title="Verify email">
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Email verification</h1>
        {status === "idle" && <p className="text-gray-600">{!router.isReady ? "Loading verification link…" : validToken ? "Press the button below to confirm your email address." : "This verification link is incomplete. Please open the full link from your verification email."}</p>}
        {router.isReady && validToken && status !== "success" && <button type="button" onClick={verify} disabled={status === "loading"} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{status === "loading" ? "Confirming…" : "Confirm email address"}</button>}
        {status === "loading" && <p className="text-gray-600">Confirming your email…</p>}
        {(status === "success" || status === "error") && (
          <p role={status === "error" ? "alert" : "status"} className={status === "success" ? "text-green-600" : "text-red-600"}>{message}</p>
        )}
        <div className="flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Return to home
          </Link>
          <Link
            href={router.query.feedback === "1" ? "/signin?callbackUrl=/feedback" : "/dashboard"}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {router.query.feedback === "1" ? "Sign in to Feedback Hub" : "Go to dashboard"}
          </Link>
        </div>
      </div>
    </Layout>
  );
}
