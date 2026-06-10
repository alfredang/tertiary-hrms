import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

/**
 * Shared Woods Square (Habitap) building-access constants and window helpers.
 * Pure and client-safe (no server-only imports) so the admin Send-invites card and
 * the staff Request-access modal can share one source of truth instead of drifting.
 */

/** "Staff Invite" events run 8:00 AM–11:00 PM — the fixed Woods Square convention. */
export const FROM_TIME = "8:00 AM";
export const TO_TIME = "11:00 PM";

/** Habitap's date-picker string format, e.g. "09 Jun 2026". */
export const HABITAP_DATE_FMT = "dd MMM yyyy";

/** A Woods Square access window may span at most this many calendar days. */
export const MAX_WINDOW_DAYS = 7;

/** Quick-pick windows for the date range (day offsets from today). */
export const DATE_PRESETS: { label: string; from: number; to: number }[] = [
  { label: "Today", from: 0, to: 0 },
  { label: "3 days", from: 0, to: 2 },
  { label: "5 days", from: 0, to: 4 },
  { label: "1 week", from: 0, to: 6 },
];

/** Resolve a preset's day offsets to an ISO (yyyy-MM-dd) from/to range, based on today. */
export function presetRange(fromOffset: number, toOffset: number): { from: string; to: string } {
  const base = new Date();
  return {
    from: format(addDays(base, fromOffset), "yyyy-MM-dd"),
    to: format(addDays(base, toOffset), "yyyy-MM-dd"),
  };
}

/** Inclusive day count for an ISO (yyyy-MM-dd) range; 0 if either end is missing or invalid. */
export function windowDaysInclusive(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const days = differenceInCalendarDays(parseISO(toIso), parseISO(fromIso)) + 1;
  return Number.isFinite(days) ? days : 0;
}
