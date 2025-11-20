import { useEffect, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

type Profile = {
  name?: string | null;
  email?: string | null;
};

type SessionUser = {
  name?: string | null;
  email?: string | null;
};

type Props = {
  profile: Profile | null | undefined;
  sessionUser: SessionUser | undefined;
};

export function FeedbackWidget({ profile, sessionUser }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reporterName = profile?.name ?? sessionUser?.name ?? "";
  const reporterEmail = profile?.email ?? sessionUser?.email ?? "";

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      setError("Add a quick subject and your feedback before sending.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const ticketTitle = `Feedback: ${subject.trim()}`;
    const bodyLines = [
      message.trim(),
      "",
      "Submitted via ProjectDesk feedback widget.",
      reporterName || reporterEmail ? `User: ${reporterName || reporterEmail}` : null,
      reporterEmail ? `Email: ${reporterEmail}` : null,
    ].filter(Boolean);

    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ticketTitle,
          description: bodyLines.join("\n"),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to send feedback right now.");
      }
      setSuccess(
        payload?.reference
          ? `Thanks! Logged as ${payload.reference}. We'll reply to your ProjectDesk email.`
          : "Thanks! Your feedback was sent to the team."
      );
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setError(err?.message || "Something went wrong sending your feedback.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {isOpen && (
        <div
          id="feedback-widget"
          className="w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-blue-100"
        >
          <div className="flex items-start justify-between bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Share feedback</p>
              <p className="text-xs text-blue-50">Feature ideas or suggestions welcome.</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 hover:bg-white/10"
              aria-label="Close feedback chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div className="space-y-1 text-xs text-gray-600">
              <p className="font-semibold text-gray-900">Signed in</p>
              <p>
                {reporterName ? `${reporterName} (${reporterEmail || "email unavailable"})` : reporterEmail}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700" htmlFor="feedback-subject">
                Subject
              </label>
              <input
                id="feedback-subject"
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Feature request or idea"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700" htmlFor="feedback-message">
                Message
              </label>
              <textarea
                id="feedback-message"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                rows={4}
                placeholder="Tell us what you'd like to see or improve."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-green-600">{success}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setSubject("");
                  setMessage("");
                  setIsOpen(false);
                }}
                disabled={loading}
                className="text-xs font-semibold text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? (
                  "Sending..."
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        aria-expanded={isOpen}
        aria-controls="feedback-widget"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
    </div>
  );
}
