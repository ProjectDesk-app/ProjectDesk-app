import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import Layout from "@/components/Layout";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "We couldn’t create your account");
      }
      setMessage(payload?.message || "Account created. Please verify your email.");
      setName("");
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err?.message || "We couldn’t create your account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Create account">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Create your ProjectDesk account</h1>
          <p className="text-sm text-gray-600">
            Join supervisors, students, and collaborators working together.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <label htmlFor="signup-name" className="text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="signup-email" className="text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="you@example.ac.uk"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="signup-password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="At least 8 characters"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button
            onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
            className="font-semibold text-blue-600 hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </Layout>
  );
}
