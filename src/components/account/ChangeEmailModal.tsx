import { useEffect, useState } from "react";
import { ModalShell } from "./ModalShell";

type Props = {
  open: boolean;
  onClose: () => void;
  currentEmail: string | null | undefined;
  pendingEmail: string | null | undefined;
  onRequested: (pendingEmail: string) => void;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ChangeEmailModal({ open, onClose, currentEmail, pendingEmail, onRequested }: Props) {
  const [email, setEmail] = useState(currentEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(currentEmail ?? "");
      setError(null);
      setSuccess(null);
    }
  }, [open, currentEmail]);

  const handleSubmit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_REGEX.test(normalized)) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to request email change");
      }
      onRequested(normalized);
      setSuccess("We sent a confirmation link to your new email. Please verify to finish.");
    } catch (err: any) {
      setError(err?.message || "Failed to request email change");
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
      title="Change email address"
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
            onClick={handleSubmit}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send confirmation"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor="account-email">
          New email address
        </label>
        <input
          id="account-email"
          type="email"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        {pendingEmail && (
          <p className="text-xs text-amber-600">
            Currently awaiting verification: {pendingEmail}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
      </div>
    </ModalShell>
  );
}
