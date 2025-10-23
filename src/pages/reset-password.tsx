import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "@/components/Layout";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { token } = router.query;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validToken = typeof token === "string" && token.length > 0;

  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [token]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to reset password");
      setMessage("Password updated successfully. You can now sign in with your new password.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.message || "Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Reset password">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Reset your password</h1>
          <p className="text-sm text-gray-600">
            Choose a new password to finish resetting your ProjectDesk account.
          </p>
        </div>

        {!validToken ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            The password reset link is invalid. Please request a new link from the forgot password page.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-1">
              <label htmlFor="reset-password" className="text-sm font-medium text-gray-700">
                New password
              </label>
              <input
                id="reset-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="reset-confirm" className="text-sm font-medium text-gray-700">
                Confirm password
              </label>
              <input
                id="reset-confirm"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-green-600">{message}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Updating password..." : "Update password"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-600">
          Need to request a new link?{" "}
          <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">
            Go to forgot password
          </Link>
        </p>
      </div>
    </Layout>
  );
}
