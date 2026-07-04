/** Short relative time ("just now", "5m ago", "3h ago", "2d ago"). */
export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const minutes = Math.floor((nowMs - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
