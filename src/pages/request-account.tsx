import { FormEvent, useState } from "react";
import Link from "next/link";

import Layout from "@/components/Layout";

export default function RequestAccountPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SUPERVISOR");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/account-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, context }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to submit your request");
      }

      setMessage(
        payload?.message ||
          "Your request has been sent to the ProjectDesk administrator. You will receive an invitation email if access is approved."
      );
      setName("");
      setEmail("");
      setRole("SUPERVISOR");
      setContext("");
    } catch (err: any) {
      setError(err?.message || "Unable to submit your request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Request account">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Request a ProjectDesk account</h1>
          <p className="text-sm text-gray-600">
            ProjectDesk is currently a private beta for invited educators, students, and collaborators.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <label htmlFor="request-name" className="text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              id="request-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="request-email" className="text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="request-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="you@example.ac.uk"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="request-role" className="text-sm font-medium text-gray-700">
              Account type
            </label>
            <select
              id="request-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="SUPERVISOR">Supervisor</option>
              <option value="STUDENT">Student</option>
              <option value="COLLABORATOR">Collaborator</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="request-context" className="text-sm font-medium text-gray-700">
              Why are you requesting access?
            </label>
            <textarea
              id="request-context"
              required
              rows={4}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Briefly describe your project, course, supervisor, or reason for joining."
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Sending request..." : "Request account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have access?{" "}
          <Link href="/signin" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </Layout>
  );
}
