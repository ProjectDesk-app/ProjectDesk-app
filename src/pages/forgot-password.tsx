import { FormEvent, useState } from "react";
import Link from "next/link";
import Layout from "@/components/Layout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to send reset email");
      setMessage("Check your inbox for a password reset link. It will expire in 2 hours.");
      setEmail("");
    } catch (err: any) {
      setError(err?.message || "Unable to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Forgot password">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Forgot your password?</h1>
          <p className="text-sm text-gray-600">
            Enter the email address associated with your ProjectDesk account and we’ll send a one-time link to reset your password.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-1">
            <label htmlFor="forgot-email" className="text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="you@example.ac.uk"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Remembered your password?{" "}
          <Link href="/" className="font-semibold text-blue-600 hover:underline">
            Return to sign in
          </Link>
        </p>
      </div>
    </Layout>
  );
}
