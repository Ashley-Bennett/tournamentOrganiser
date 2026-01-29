/**
 * Format an ISO date string for display (date only).
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

/**
 * Format an ISO date string for display (date and time).
 */
export function formatDateTime(value: string | null | undefined): string {
  if (value == null) return "";
  return new Date(value).toLocaleString();
}
