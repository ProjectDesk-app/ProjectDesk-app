import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import Link from "next/link";

type Status = "idle" | "processing" | "success" | "error";

export default function SubscriptionCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("Finalising your subscription...");
  const [supportingInfo, setSupportingInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const flowIdParam = router.query.redirect_flow_id;
    const flowId =
      typeof flowIdParam === "string"
        ? flowIdParam
        : Array.isArray(flowIdParam)
        ? flowIdParam[0]
        : null;

    if (!flowId) {
      setStatus("error");
      setMessage("We couldn't find a GoCardless redirect flow to complete.");
      return;
    }

    const complete = async () => {
      setStatus("processing");
      try {
        const res = await fetch("/api/supervisor/subscription/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || "Unable to complete subscription setup");
        }
        setStatus("success");
        setMessage("Subscription updated! You can manage sponsored accounts right away.");
        setSupportingInfo(
          `Subscription ID ${payload?.subscriptionId ?? "unknown"} · Status ${payload?.subscriptionStatus ?? "created"}`
        );
        setTimeout(() => {
          router.replace("/supervisor");
        }, 4000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err?.message || "We couldn't finish setting up your subscription.");
      }
    };

    complete();
  }, [router]);

  const renderStatusAccent = () => {
    if (status === "processing" || status === "idle") {
      return "text-blue-600 bg-blue-50";
    }
    if (status === "success") {
      return "text-green-600 bg-green-50";
    }
    return "text-red-600 bg-red-50";
  };

  return (
    <Layout title="Subscription status">
      <div className="mx-auto max-w-md space-y-6 rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Updating subscription…</h1>
        <p className={`rounded-md px-3 py-2 text-sm font-medium ${renderStatusAccent()}`}>{message}</p>
        {supportingInfo && <p className="text-xs text-gray-500">{supportingInfo}</p>}
        {status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You can retry the process from the supervisor dashboard. If the problem persists, contact support with
              the details above.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/supervisor"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
              >
                Return to dashboard
              </Link>
              <a
                href="https://projectdesk.app/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
              >
                Contact support
              </a>
            </div>
          </div>
        )}
        {status === "success" && (
          <p className="text-xs text-gray-500">We’ll send you back to your dashboard in a moment.</p>
        )}
      </div>
    </Layout>
  );
}
