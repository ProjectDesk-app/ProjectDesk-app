import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import Layout from "@/components/Layout";

type CaptchaChallenge = {
  first: number;
  second: number;
};

const createChallenge = (): CaptchaChallenge => ({
  first: Math.floor(Math.random() * 8) + 2,
  second: Math.floor(Math.random() * 8) + 2,
});

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("Account access");
  const [description, setDescription] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaChallenge>(() => createChallenge());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expectedAnswer = useMemo(() => captcha.first + captcha.second, [captcha]);

  const refreshCaptcha = () => {
    setCaptcha(createChallenge());
    setCaptchaAnswer("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const answer = Number(captchaAnswer);
    if (!Number.isFinite(answer) || answer !== expectedAnswer) {
      setError("The maths answer was incorrect. Please try again.");
      refreshCaptcha();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          type,
          description,
          captcha: {
            answer,
            first: captcha.first,
            second: captcha.second,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to send message");
      }

      setMessage(
        payload?.reference
          ? `Message sent. Reference: ${payload.reference}`
          : "Message sent. We will get back to you soon."
      );
      setName("");
      setEmail("");
      setType("Account access");
      setDescription("");
      refreshCaptcha();
    } catch (err: any) {
      setError(err?.message || "Unable to send message");
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Contact">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Contact ProjectDesk</h1>
          <p className="text-sm text-gray-600">
            Use this form for beta access, support, account questions, or security reports.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="contact-name" className="text-sm font-medium text-gray-700">
                Full name
              </label>
              <input
                id="contact-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="contact-email" className="text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="you@example.ac.uk"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="contact-type" className="text-sm font-medium text-gray-700">
              Topic
            </label>
            <select
              id="contact-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="Account access">Account access</option>
              <option value="Beta request">Beta request</option>
              <option value="Issue">Issue</option>
              <option value="Bug report">Bug report</option>
              <option value="Partnership">Partnership</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="contact-description" className="text-sm font-medium text-gray-700">
              Message
            </label>
            <textarea
              id="contact-description"
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="How can we help?"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="contact-captcha" className="text-sm font-medium text-gray-700">
              Maths check
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                {captcha.first} + {captcha.second} = ?
              </span>
              <input
                id="contact-captcha"
                type="text"
                inputMode="numeric"
                required
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="Answer"
              />
              <button
                type="button"
                onClick={refreshCaptcha}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                New question
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send message"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Need a ProjectDesk account?{" "}
          <Link href="/request-account" className="font-semibold text-blue-600 hover:underline">
            Request access
          </Link>
        </p>
      </div>
    </Layout>
  );
}
