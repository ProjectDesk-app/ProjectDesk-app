import { useEffect, useMemo, useState } from "react";

export type MemberRole = "STUDENT" | "COLLABORATOR";

export type ProjectMemberFormValue = {
  id?: number;
  name?: string | null;
  email: string;
  role: MemberRole;
};

type SearchResult = {
  id: number;
  name: string | null;
  email: string;
  role: string;
};

type Props = {
  label: string;
  role: MemberRole;
  members: ProjectMemberFormValue[];
  onChange: (members: ProjectMemberFormValue[]) => void;
};

export function MemberSelector({ label, role, members, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Search failed");
        const payload = await res.json();
        if (!cancelled) {
          setResults(payload || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Unable to search users");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const selectedEmails = useMemo(
    () => new Set(members.map((member) => member.email.toLowerCase())),
    [members]
  );

  const addMember = (member: ProjectMemberFormValue) => {
    if (selectedEmails.has(member.email.toLowerCase())) {
      return;
    }
    onChange([...members, member]);
    setQuery("");
    setResults([]);
  };

  const handleSelect = (result: SearchResult) => {
    addMember({
      id: result.id,
      name: result.name,
      email: result.email,
      role,
    });
  };

  const removeMember = (email: string) => {
    onChange(members.filter((member) => member.email !== email));
  };

  const handleManualAdd = () => {
    const email = manualEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (selectedEmails.has(email)) {
      setError("That email is already added.");
      return;
    }
    addMember({
      email,
      name: manualName.trim() || undefined,
      role,
    });
    setManualEmail("");
    setManualName("");
    setError(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">
            Search for existing accounts or add new people by name and email address.
          </p>
        </div>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          {members.length}
        </span>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-600" htmlFor={`${label}-search`}>
          Find an existing user
        </label>
        <input
          id={`${label}-search`}
          type="text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <p className="text-xs text-gray-500">Searching…</p>}
        {!loading && results.length > 0 && (
          <ul className="space-y-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
            {results
              .filter((result) => !selectedEmails.has(result.email.toLowerCase()))
              .map((result) => (
                <li
                  key={result.id}
                  className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-white"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">
                      {result.name || result.email}
                    </span>
                    <span className="text-xs text-gray-600">{result.email}</span>
                  </div>
                  <button
                    onClick={() => handleSelect(result)}
                    className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Add
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

  <div className="grid grid-cols-1 gap-2 border-t border-gray-200 pt-3">
        <p className="text-xs font-medium text-gray-600">Add someone new</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Name (optional)"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <input
            type="email"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Email address"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
          />
          <button
            type="button"
            onClick={handleManualAdd}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add new
          </button>
        </div>
      </div>

      {members.length > 0 && (
        <ul className="space-y-2 border-t border-gray-200 pt-3">
          {members.map((member) => (
            <li
              key={member.email}
              className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-gray-900">{member.name || member.email}</span>
                <span className="text-xs text-gray-600">{member.email}</span>
              </div>
              <button
                onClick={() => removeMember(member.email)}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
