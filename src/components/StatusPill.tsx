export default function StatusPill({ status }: { status: string }) {
  // Unified styles used across the app for task statuses
  const statusStyles: Record<string, string> = {
    todo: "bg-gray-200 text-gray-800",
    in_progress: "bg-blue-200 text-blue-800",
    behind_schedule: "bg-orange-200 text-orange-800",
    blocked: "bg-red-200 text-red-800",
    review: "bg-purple-200 text-purple-800",
    deferred: "bg-yellow-200 text-yellow-800",
    done: "bg-green-200 text-green-800",
  };

  const labelMap: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    behind_schedule: "Behind Schedule",
    blocked: "Blocked",
    review: "Review",
    deferred: "Deferred",
    done: "Done",
  };

  const normalizedStatus = status?.toLowerCase().trim() || "unknown";

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
        statusStyles[normalizedStatus] || "bg-gray-200 text-gray-800"
      }`}
    >
      {labelMap[normalizedStatus] || "Unknown"}
    </span>
  );
}