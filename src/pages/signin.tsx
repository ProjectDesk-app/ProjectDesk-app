import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Layout from "@/components/Layout";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: "/dashboard",
      });
      if (result?.error) {
        throw new Error(result.error);
      }
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setError(err?.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Sign in">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-600">
            Sign in to continue where you left off on ProjectDesk.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <label htmlFor="signin-email" className="text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="signin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="signin-password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="space-y-3 text-center text-sm text-gray-600">
          <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">
            Forgot password?
          </Link>
          <p>
            Need an account?{" "}
            <Link href="/signup" className="font-semibold text-blue-600 hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
