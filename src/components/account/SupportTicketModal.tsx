import { useEffect, useState } from "react";
import { ModalShell } from "./ModalShell";

type Profile = {
  name?: string | null;
  email?: string | null;
};

type SessionUser = {
  name?: string | null;
  email?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile | null | undefined;
  sessionUser: SessionUser | undefined;
};

export function SupportTicketModal({ open, onClose, profile, sessionUser }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reporterName = profile?.name ?? sessionUser?.name ?? "";
  const reporterEmail = profile?.email ?? sessionUser?.email ?? "";

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setSuccess(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const submitTicket = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Please provide both a title and description for the issue.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to submit support request");
      }
      setSuccess(
        "Thanks! Your ticket has been submitted. Our team will follow up via your ProjectDesk email."
      );
      setTitle("");
      setDescription("");
    } catch (err: any) {
      setError(err?.message || "Something went wrong while submitting your ticket.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      title="Get help"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            disabled={loading}
          >
            Close
          </button>
          <button
            onClick={submitTicket}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Sending..." : "Submit ticket"}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        Need some support? Let us know what’s happening using the form below.
      </p>
      <div className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
        <p>
          <span className="text-gray-500 uppercase text-xs">Signed in as</span>
          <br />
          <span className="font-medium text-gray-900">
            {reporterName ? `${reporterName} (${reporterEmail || "email unavailable"})` : reporterEmail}
          </span>
        </p>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700" htmlFor="support-title">
          Issue title
        </label>
        <input
          id="support-title"
          type="text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Unable to invite a collaborator"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700" htmlFor="support-description">
          Description
        </label>
        <textarea
          id="support-description"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          rows={4}
          placeholder="Share details so we can reproduce the issue and help quickly."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
    </ModalShell>
  );
}
