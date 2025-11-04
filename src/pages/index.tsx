import Image from "next/image";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import Layout from "@/components/Layout";
import Logo from "@/assets/branding/ProjectDesk-Transparent.png";
import { quoteOfTheDay } from "@/lib/quotes";

export default function Home() {
  const { data: session } = useSession();
  const quote = quoteOfTheDay();
  const welcomeName = session?.user?.name || session?.user?.email;

  return (
    <Layout>
      <section className="flex flex-col items-center text-center gap-6">
        <Image src={Logo} alt="ProjectDesk" className="h-16 w-auto" priority />
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">
            {session ? `Welcome back${welcomeName ? `, ${welcomeName}` : ""}!` : "Welcome to ProjectDesk"}
          </h1>
          {!session && (
            <>
              <p className="text-gray-600 max-w-2xl">
                ProjectDesk keeps research teams organised, connected, and on track. Plan milestones, support students, and collaborate with confidence.
              </p>
              <a
                href="https://projectdesk.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                Learn more
              </a>
            </>
          )}
        </div>
        {session ? (
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Go to dashboard
            </Link>
            <span className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600">
              Signed in as {session.user?.email}
            </span>
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <button
              onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
              className="w-full rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Sign in
            </button>
              <Link
                href="/signup"
                className="w-full rounded-md border border-blue-600 px-5 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
              >
                Create account
              </Link>
              <Link
                href="/forgot-password"
                className="text-center text-sm font-semibold text-blue-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        )}

        <div className="mt-8 max-w-2xl rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-left">
          <p className="text-xs uppercase tracking-wide text-blue-600">Quote of the day</p>
          <blockquote className="mt-2 text-base italic text-gray-700">“{quote.text}”</blockquote>
          <p className="mt-2 text-sm font-semibold text-blue-700">— {quote.author}</p>
        </div>
      </section>
    </Layout>
  );
}
