import { useQuery } from "@tanstack/react-query";
import type { AnalyticsOverview, AnalyticsRange } from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

/** Real numbers for the Dashboard and Analytics screens; refreshed every minute while the tab is open. */
export function useAnalytics(range: AnalyticsRange) {
  return useQuery({
    queryKey: ["analytics", range],
    queryFn: () => api<AnalyticsOverview>("/analytics/overview", { query: { range } }),
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** "+12%" / "-8%" against the previous period, or null when there is nothing to compare with. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export const percent = (part: number, whole: number): string =>
  whole === 0 ? "0%" : `${Math.round((part / whole) * 1000) / 10}%`;

/** 138 -> "2m 18s", 45 -> "45s", 4000 -> "1h 6m". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
