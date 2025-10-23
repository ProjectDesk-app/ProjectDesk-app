import { ModalShell } from "./ModalShell";

type Profile = {
  name?: string | null;
  email?: string | null;
  pendingEmail?: string | null;
  emailVerified?: string | Date | null;
  role?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile | null | undefined;
};

export function ProfileOverviewModal({ open, onClose, profile }: Props) {
  const verified = profile?.emailVerified ? new Date(profile.emailVerified) : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="My Account"
      footer={
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Close
        </button>
      }
    >
      <div>
        <p className="text-xs uppercase text-gray-500">Name</p>
        <p className="font-medium text-gray-900">{profile?.name || "—"}</p>
      </div>
      <div>
        <p className="text-xs uppercase text-gray-500">Email</p>
        <p className="font-medium text-gray-900">{profile?.email || "—"}</p>
        {profile?.pendingEmail && (
          <p className="text-xs text-amber-600 mt-1">
            Pending verification: {profile.pendingEmail}
          </p>
        )}
      </div>
      <div>
        <p className="text-xs uppercase text-gray-500">Role</p>
        <p className="font-medium text-gray-900">{profile?.role || "—"}</p>
      </div>
      <div>
        <p className="text-xs uppercase text-gray-500">Email Verified</p>
        <p className="font-medium text-gray-900">
          {verified ? verified.toLocaleString() : "Awaiting verification"}
        </p>
      </div>
    </ModalShell>
  );
}
