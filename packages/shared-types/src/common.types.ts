import { z } from "zod";

/** Standard pagination query (?page=1&pageSize=25). */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Envelope returned by every paginated list endpoint. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/**
 * Normalises a phone number to a WhatsApp id: digits only, with country code,
 * no "+" (e.g. "+91 98765-43210" -> "919876543210"). Returns null when the
 * value cannot be a valid E.164 number (7-15 digits).
 *
 * `defaultCountryCode` is prefixed to national-format numbers: numbers of 10
 * digits (or 11 starting with a trunk "0") that do not already carry it.
 */
export function normalizeWaId(input: string, defaultCountryCode?: string): string | null {
  let digits = String(input ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;

  // "00" international call prefix.
  if (String(input).trim().startsWith("00")) digits = digits.replace(/^00/, "");

  if (defaultCountryCode) {
    const cc = defaultCountryCode.replace(/[^\d]/g, "");
    if (cc) {
      if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
      // A national-format number has at most 10 digits; anything longer is
      // assumed to already include its country code.
      if (digits.length <= 10) digits = cc + digits;
    }
  }

  return /^\d{7,15}$/.test(digits) ? digits : null;
}

/** Formats a WhatsApp id for display: "919876543210" -> "+919876543210". */
export function formatWaId(waId: string): string {
  return `+${waId}`;
}

export const ANALYTICS_RANGES = ["today", "7d", "30d", "90d"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** GET /analytics/overview: everything the Dashboard and Analytics screens show. */
export interface AnalyticsOverview {
  range: AnalyticsRange;
  /** First instant of the period, in the business's time zone. */
  since: string;
  messages: {
    /** Messages the business sent (not counting ones that failed). */
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    inbound: number;
    previousSent: number;
    previousInbound: number;
  };
  conversations: {
    started: number;
    previousStarted: number;
    open: number;
    unread: number;
    /** Average time from a customer's first message to a team member's first reply. */
    avgFirstResponseSeconds: number | null;
  };
  contacts: { total: number; new: number; previousNew: number; optedOut: number };
  daily: { date: string; inbound: number; outbound: number; newContacts: number }[];
  campaigns: {
    total: number;
    running: number;
    recent: {
      id: string;
      name: string;
      status: string;
      total: number;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      createdAt: string;
    }[];
  };
}
