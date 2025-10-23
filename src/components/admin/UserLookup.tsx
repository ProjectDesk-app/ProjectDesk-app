import { useEffect, useState } from "react";

const fetcher = (q: string) => fetch(`/api/users/search?q=${encodeURIComponent(q)}`).then((res) => res.json());

type Option = {
  id: number;
  name: string | null;
  email: string;
  role: string;
};

type Props = {
  onSelect: (option: Option) => void;
};

export function UserLookup({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const payload = await fetcher(query);
        if (!cancelled) setResults(payload || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        placeholder="Search users by name or email"
      />
      {loading && <p className="text-xs text-gray-500">Searching…</p>}
      {!loading && results.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
          {results.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(option);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-white"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-gray-900">{option.name || option.email}</span>
                  <span className="text-xs text-gray-600">{option.email}</span>
                </div>
                <span className="text-xs uppercase text-gray-500">{option.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
