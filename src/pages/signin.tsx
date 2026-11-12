import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Layout from "@/components/Layout";
import { useRouter } from "next/router";
import { quoteOfTheDay } from "@/lib/quotes";

export default function SignInPage() {
  const router = useRouter();
  const callbackUrl = typeof router.query.callbackUrl === "string" && router.query.callbackUrl.startsWith("/") && !router.query.callbackUrl.startsWith("//") && !router.query.callbackUrl.includes("\\") ? router.query.callbackUrl : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<ReturnType<typeof quoteOfTheDay> | null>(null);

  useEffect(() => {
    // Resolve in the browser so static builds cannot freeze the daily quote.
    const refreshQuote = () => setQuote(quoteOfTheDay());
    refreshQuote();
    const timer = window.setInterval(refreshQuote, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl,
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
            Need access?{" "}
            <Link href="/request-account" className="font-semibold text-blue-600 hover:underline">
              Request account
            </Link>
          </p>
        </div>
        {quote && <figure className="rounded-lg bg-blue-50 px-5 py-4 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Quote of the day</p>
          <blockquote className="text-sm italic leading-relaxed text-gray-700">“{quote.text}”</blockquote>
          <figcaption className="mt-2 text-xs font-medium text-gray-600">{quote.author}</figcaption>
        </figure>}
        <footer className="border-t border-gray-200 pt-4 text-center text-sm text-gray-500">
          Need help?{" "}
          <Link href="/contact" className="font-semibold text-blue-600 hover:underline">
            Contact us
          </Link>
        </footer>
      </div>
    </Layout>
  );
}
