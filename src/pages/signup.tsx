import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import Layout from "@/components/Layout";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"SUPERVISOR" | "STUDENT" | "COLLABORATOR">("SUPERVISOR");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountDescription = useMemo(() => {
    if (accountType === "SUPERVISOR") {
      return "Create a supervisor account. You'll start with an 8-day free trial and can begin a subscription to unlock sponsorships.";
    }
    if (accountType === "STUDENT") {
      return "Request access as a student. We'll notify your supervisor so they can sponsor your account.";
    }
    return "Request access as a collaborator. We'll notify your supervisor so they can sponsor your account.";
  }, [accountType]);

  useEffect(() => {
    if (accountType === "SUPERVISOR") {
      setSponsorEmail("");
    }
  }, [accountType]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          accountType,
          sponsorEmail: accountType === "SUPERVISOR" ? null : sponsorEmail,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "We couldn’t create your account");
      }
      setMessage(payload?.message || "Account created. Please verify your email.");
      setName("");
      setEmail("");
      setPassword("");
      setSponsorEmail("");
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-gray-700">Account type</legend>
            <div className="grid gap-2">
              {[
                {
                  value: "SUPERVISOR",
                  label: "Supervisor (default)",
                  description: "Manage projects, start subscriptions, and sponsor collaborators.",
                },
                {
                  value: "STUDENT",
                  label: "Student",
                  description: "Collaborate on assigned projects. Requires supervisor sponsorship.",
                },
                {
                  value: "COLLABORATOR",
                  label: "Collaborator",
                  description: "Assist on shared projects. Requires a Principal Investigator to sponsor your access.",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm transition ${
                    accountType === option.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="accountType"
                      value={option.value}
                      checked={accountType === option.value}
                      onChange={() => setAccountType(option.value as typeof accountType)}
                    />
                    <span className="font-medium text-gray-900">{option.label}</span>
                  </span>
                  <span className="pl-6 text-xs text-gray-600">{option.description}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">{accountDescription}</p>
          </fieldset>

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
          {(accountType === "STUDENT" || accountType === "COLLABORATOR") && (
            <div className="space-y-1">
              <label htmlFor="signup-sponsor-email" className="text-sm font-medium text-gray-700">
                {accountType === "COLLABORATOR" ? "Principal Investigator email" : "Supervisor email"}
              </label>
              <input
                id="signup-sponsor-email"
                type="email"
                required
                value={sponsorEmail}
                onChange={(e) => setSponsorEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="supervisor@example.ac.uk"
              />
              <p className="text-xs text-gray-500">
                We&rsquo;ll email your {accountType === "COLLABORATOR" ? "Principal Investigator" : "supervisor"} so they can sponsor your access.
              </p>
            </div>
          )}
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
