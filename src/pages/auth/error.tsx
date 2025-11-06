import { useCallback, useMemo } from "react";
import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { AlertTriangle, ArrowLeft, Home, RefreshCcw } from "lucide-react";

import Layout from "@/components/Layout";

type ErrorInfo = {
  title: string;
  description: string;
  help?: string;
};

type AuthErrorPageProps = {
  rawError: string | null;
};

const decodeParam = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const CODE_MESSAGES: Record<string, ErrorInfo> = {
  configuration: {
    title: "Configuration issue",
    description: "We hit a configuration problem while signing you in.",
    help: "Please try again in a moment or contact us if the issue persists.",
  },
  accessdenied: {
    title: "Access denied",
    description: "You don't have permission to access that resource.",
    help: "Reach out to your ProjectDesk admin if you think you should have access.",
  },
  verification: {
    title: "Verification required",
    description: "We couldn't verify your sign-in request.",
    help: "Sign in again using the latest link we emailed you.",
  },
  oauthsignin: {
    title: "Provider sign-in failed",
    description: "Your sign-in provider rejected the request.",
    help: "Try signing in again, or use a different provider if you have one.",
  },
  oauthcallback: {
    title: "Provider callback failed",
    description: "We couldn't confirm the response from your sign-in provider.",
    help: "Try again in a moment or use manual credentials if available.",
  },
  oauthcreateaccount: {
    title: "Provider account setup failed",
    description: "We couldn't finish creating your account with that provider.",
    help: "Try the sign-in again or create an account with email and password instead.",
  },
  oauthaccountnotlinked: {
    title: "Account already linked",
    description: "This email is already connected with a different sign-in method.",
    help: "Please sign in using the provider you originally used or contact support to link accounts.",
  },
  emailcreateaccount: {
    title: "Email sign-in link expired",
    description: "The email link you used has expired or was already used.",
    help: "Request a new sign-in link and use it right away.",
  },
  callback: {
    title: "Sign-in callback failed",
    description: "We couldn't complete the sign-in flow.",
    help: "Please try again. Contact support if this continues to happen.",
  },
  signin: {
    title: "Sign-in failed",
    description: "We ran into a problem while signing you in.",
    help: "Try again in a moment or reset your password if needed.",
  },
  sessionrequired: {
    title: "Sign-in required",
    description: "You need to be signed in to view that page.",
    help: "Sign in and try again.",
  },
  credentialssignin: {
    title: "Incorrect sign-in details",
    description: "Your email or password didn't match our records.",
    help: "Check your credentials and try again, or reset your password.",
  },
};

const EXACT_TEXT_MATCHES: Record<string, ErrorInfo> = {
  "no user found": {
    title: "Account not found",
    description: "We couldn't find an account with that email address.",
    help: "Check for typos or create a new ProjectDesk account.",
  },
  "invalid password": {
    title: "Incorrect password",
    description: "The password you entered doesn't match our records.",
    help: "Try again or reset your password.",
  },
  "email not verified": {
    title: "Email verification needed",
    description: "You need to verify your email before you can sign in.",
    help: "Check your inbox for a verification link. We've sent a fresh one just in case.",
  },
  "awaiting sponsorship approval": {
    title: "Awaiting sponsorship approval",
    description: "Your supervisor still needs to approve your sponsorship before you can sign in.",
    help: "We've notified your supervisor. Reach out to them if you need to speed things up.",
  },
  "subscription cancelled": {
    title: "Subscription inactive",
    description: "Your subscription is currently inactive.",
    help: "Restart your subscription or contact support if this doesn't look right.",
  },
  "your free trial has ended": {
    title: "Free trial complete",
    description: "Your free trial has ended, so access is currently paused.",
    help: "Start a subscription to keep using ProjectDesk, or contact us if you need more time.",
  },
};

const PARTIAL_MATCHES: Array<{ pattern: RegExp; info: ErrorInfo }> = [
  {
    pattern: /trial/i,
    info: EXACT_TEXT_MATCHES["your free trial has ended"],
  },
  {
    pattern: /password/i,
    info: EXACT_TEXT_MATCHES["invalid password"],
  },
  {
    pattern: /verify|verification/i,
    info: EXACT_TEXT_MATCHES["email not verified"],
  },
];

const DEFAULT_ERROR: ErrorInfo = {
  title: "We couldn't sign you in",
  description: "Something went wrong while signing you in.",
  help: "Please try again, and contact support if the problem continues.",
};

function interpretError(error: string | null): ErrorInfo {
  if (!error) return DEFAULT_ERROR;

  const trimmed = error.trim();
  if (!trimmed) return DEFAULT_ERROR;

  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/\s+/g, "");

  if (CODE_MESSAGES[compact]) {
    return CODE_MESSAGES[compact];
  }

  if (EXACT_TEXT_MATCHES[lower]) {
    return EXACT_TEXT_MATCHES[lower];
  }

  const partialMatch = PARTIAL_MATCHES.find(({ pattern }) => pattern.test(lower));
  if (partialMatch) {
    return partialMatch.info;
  }

  return {
    title: DEFAULT_ERROR.title,
    description: trimmed,
    help: DEFAULT_ERROR.help,
  };
}

export default function AuthErrorPage({ rawError }: AuthErrorPageProps) {
  const router = useRouter();

  const interpreted = useMemo(() => interpretError(rawError), [rawError]);

  const handleGoBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }, [router]);

  return (
    <Layout title={interpreted.title}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-12 text-center">
        <span className="rounded-full bg-red-100 p-4 text-red-600">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-gray-900">{interpreted.title}</h1>
          <p className="text-sm text-gray-600">{interpreted.description}</p>
          {interpreted.help && <p className="text-sm text-gray-500">{interpreted.help}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Return home
          </Link>
          <a
            href="https://projectdesk.app/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-transparent px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
          >
            Contact support
          </a>
        </div>
        {rawError && (
          <details className="w-full max-w-md rounded-md border border-gray-200 bg-white/60 p-4 text-left text-sm text-gray-600">
            <summary className="cursor-pointer font-semibold text-gray-700">Technical details</summary>
            <p className="mt-2 break-words text-gray-500">{rawError}</p>
          </details>
        )}
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<AuthErrorPageProps> = async ({ query }) => {
  const rawErrorParam = query?.error;
  const rawError =
    typeof rawErrorParam === "string"
      ? decodeParam(rawErrorParam)
      : Array.isArray(rawErrorParam)
      ? decodeParam(rawErrorParam[0])
      : null;

  return {
    props: {
      rawError: rawError || null,
    },
  };
};
