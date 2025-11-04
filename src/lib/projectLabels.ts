export function getProjectLeadLabel(category?: string | null): string {
  return category?.toLowerCase() === "collaboration"
    ? "Principal Investigator"
    : "Supervisor";
}

