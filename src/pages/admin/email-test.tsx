import { useState } from "react";
import type { FormEvent } from "react";
import Layout from "@/components/Layout";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { toast, Toaster } from "react-hot-toast";
import Link from "next/link";

export default function AdminEmailTest() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSending(true);

    try {
      const response = await fetch("/api/admin/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, message }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send email");
      }

      toast.success("Email sent successfully");
      setMessage("");
    } catch (error: any) {
      toast.error(error?.message || "Unable to send email");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Layout title="Email Delivery Test">
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-semibold text-gray-900">Test email delivery</h1>
          <p className="mt-2 text-sm text-amber-800">
            Use this page to verify that your Mailgun configuration is working. Messages sent here will be delivered to
            the recipient exactly as entered, so double-check before you send.
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Tip: keep this page for internal use only.{" "}
            <Link href="/admin" className="text-amber-900 underline">
              Return to admin dashboard
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
            To
            <input
              type="email"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="recipient@example.com"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
            Subject
            <input
              type="text"
              required
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Subject line"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
            Message
            <textarea
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Write the email body here…"
            />
          </label>

          <button
            type="submit"
            disabled={isSending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending..." : "Send test email"}
          </button>
        </form>
      </div>
      <Toaster position="bottom-right" />
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") {
    return {
      redirect: {
        destination: "/api/auth/signin",
        permanent: false,
      },
    };
  }

  return { props: {} };
};
