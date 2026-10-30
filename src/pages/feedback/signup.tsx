import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import Layout from "@/components/Layout";

export default function FeedbackSignup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const token = typeof router.query.token === "string" ? router.query.token : "";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/feedback-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name, email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create account");
      setMessage(data.message); setPassword("");
    } catch (err: any) { setError(err.message || "Unable to create account"); }
    finally { setBusy(false); }
  }
  const field = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
  return <Layout title="Join Feedback Hub">
    <Head><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Head>
    <div className="mx-auto max-w-md space-y-6">
      <div><p className="text-sm font-semibold text-blue-600">Feedback Hub</p><h1 className="mt-2 text-2xl font-semibold text-gray-900">See your feedback journey</h1><p className="mt-3 text-sm text-gray-600">Create a free account using the email address that received your tracking link. See your full review history and request an update when feedback is overdue.</p></div>
      {!token && router.isReady ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Open Track Progress in your receipt email, then choose Create account.</p> : <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium" htmlFor="feedback-name">Full name<input className={field} id="feedback-name" autoComplete="name" required maxLength={150} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block text-sm font-medium" htmlFor="feedback-email">Email address<input className={field} id="feedback-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium" htmlFor="feedback-password">Password<input className={field} id="feedback-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><span className="mt-1 block text-xs font-normal text-gray-500">At least 8 characters</span></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}
        <button disabled={busy || !token || Boolean(message)} className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "Creating account…" : "Create free account"}</button>
      </form>}
      <p className="text-center text-sm text-gray-600">Already have an account? <Link className="font-semibold text-blue-600 hover:underline" href="/signin?callbackUrl=/feedback">Sign in</Link></p>
    </div>
  </Layout>;
}
