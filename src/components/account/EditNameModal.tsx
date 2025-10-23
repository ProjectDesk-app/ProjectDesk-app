import { useEffect, useState } from "react";
import { ModalShell } from "./ModalShell";

type Props = {
  open: boolean;
  onClose: () => void;
  initialName: string | null | undefined;
  onUpdated: (name: string) => void;
};

export function EditNameModal({ open, onClose, initialName, onUpdated }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setError(null);
    }
  }, [open, initialName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update name");
      }
      onUpdated(trimmed);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to update name");
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
      title="Edit your name"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor="account-name">
          Full name
        </label>
        <input
          id="account-name"
          type="text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
}
