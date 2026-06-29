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

/** A Woods Square access window may span at most this many calendar days (one week). */
export const MAX_WINDOW_DAYS = 7;

/** A staff member may have at most this many outstanding (PENDING) access requests at once. */
export const MAX_PENDING_REQUESTS = 5;

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

/* -------------------------------------------------------------------------- */
/* Monthly auto-invite scheduler helpers (pure — no DB, no side effects).      */
/* The scheduler fires on the 15th of each month and sends the UPCOMING         */
/* month's invites, split into ≤7-day windows.                                  */
/* -------------------------------------------------------------------------- */

/** The fixed calendar day each month the auto-invite fires (at 12:00 PM SGT). */
export const SEND_DAY_OF_MONTH = 15;

/** The configured monthly send day of the given month (monthIndex 0–11), at local midnight. */
export function scheduledSendDate(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, SEND_DAY_OF_MONTH);
}

/** True if `date` falls on the configured monthly send day. */
export function isScheduledSendDay(date: Date): boolean {
  return date.getDate() === SEND_DAY_OF_MONTH;
}

/**
 * True once `date` is strictly PAST the configured send day of its month — i.e. the monthly
 * send window (and its all-day retries) has fully elapsed. Used by the "missed send" nudge so
 * it only flags a month as missed the day AFTER, never racing the run on the day itself.
 */
export function isAfterScheduledSendDay(date: Date): boolean {
  return date.getDate() > SEND_DAY_OF_MONTH;
}

/**
 * Split a month (monthIndex 0–11) into consecutive ≤7-day windows that cover every
 * day, the last window clamped to the month end (e.g. Jul → 1–7, 8–14, 15–21, 22–28,
 * 29–31). Returns ISO yyyy-MM-dd { from, to } pairs.
 */
export function monthWindows(year: number, monthIndex: number): { from: string; to: string }[] {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (day: number) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  const windows: { from: string; to: string }[] = [];
  for (let start = 1; start <= lastDay; start += 7) {
    windows.push({ from: iso(start), to: iso(Math.min(start + 6, lastDay)) });
  }
  return windows;
}

/** The {year, monthIndex} of the month after the given date — i.e. the "upcoming" month. */
export function upcomingMonthOf(date: Date): { year: number; monthIndex: number } {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 1); // 1st of next month (handles Dec→Jan)
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

/* -------------------------------------------------------------------------- */
/* Coverage helpers — used by the send dedup to decide whether a requested      */
/* window is ALREADY covered by a person's existing invites, even when those    */
/* invites are split across several rows with different date boundaries.        */
/* -------------------------------------------------------------------------- */

/**
 * Merge day-inclusive date ranges into the fewest contiguous spans. Consecutive days
 * (a ≤1-day gap, e.g. 01–03 Jul then 04–10 Jul) count as contiguous and merge — there's
 * no missing day of access between them. Ranges with a real gap stay separate. Input is
 * left untouched; output is sorted ascending by start.
 */
export function mergeDateRanges(ranges: { from: Date; to: Date }[]): { from: Date; to: Date }[] {
  const sorted = ranges
    .filter((r) => r.from <= r.to)
    .map((r) => ({ from: r.from, to: r.to }))
    .sort((a, b) => +a.from - +b.from);
  const merged: { from: Date; to: Date }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    // ≤1 calendar day between the end of `last` and the start of `r` ⇒ no gap ⇒ merge.
    if (last && differenceInCalendarDays(r.from, last.to) <= 1) {
      if (r.to > last.to) last.to = r.to;
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }
  return merged;
}

/**
 * If the UNION of `ranges` fully covers every day of [from, to], return the single merged
 * span that contains it (handy for an "already covered by …" message); otherwise null.
 * This is what makes the scheduler idempotent regardless of how a person's existing
 * invites were dated/split — a fully-covered month is never re-sent.
 */
export function coveringRange(
  ranges: { from: Date; to: Date }[],
  from: Date,
  to: Date,
): { from: Date; to: Date } | null {
  return mergeDateRanges(ranges).find((m) => m.from <= from && m.to >= to) ?? null;
}

/**
 * The ≤7-day windows that cover ONLY the days in [fromIso, toIso] that `covered` doesn't
 * already include. Each contiguous gap is split into ≤7-day chunks from the gap's start
 * (so a missing 08–31 becomes 08–14, 15–21, 22–28, 29–31). No prior coverage → the whole
 * range split into ≤7-day windows; fully covered → `[]`. This is the single source of
 * truth for "send only what's missing", used by manual, test, and scheduled sends.
 */
export function gapWindows(
  fromIso: string,
  toIso: string,
  covered: { from: Date; to: Date }[],
): { from: string; to: string }[] {
  const start = parseISO(fromIso);
  const end = parseISO(toIso);
  if (end < start) return [];
  const merged = mergeDateRanges(covered);
  const isCovered = (dd: Date) => merged.some((m) => m.from <= dd && dd <= m.to);
  const iso = (dd: Date) => format(dd, "yyyy-MM-dd");
  const windows: { from: string; to: string }[] = [];
  let runStart: Date | null = null;
  for (let dd = start; dd <= end; dd = addDays(dd, 1)) {
    const uncovered = !isCovered(dd);
    if (uncovered && runStart === null) runStart = dd;
    // Close the current uncovered run when we hit a covered day or the range's end.
    if (runStart !== null && (!uncovered || differenceInCalendarDays(end, dd) === 0)) {
      const runEnd = uncovered ? dd : addDays(dd, -1); // inclusive last uncovered day
      for (let s = runStart; s <= runEnd; s = addDays(s, 7)) {
        const cap = addDays(s, 6);
        windows.push({ from: iso(s), to: iso(cap <= runEnd ? cap : runEnd) });
      }
      runStart = null;
    }
  }
  return windows;
}

/**
 * Convenience wrapper over {@link gapWindows} for a whole month (monthIndex 0–11) — the
 * ≤7-day windows covering the days of that month not already in `covered`.
 */
export function missingWindows(
  year: number,
  monthIndex: number,
  covered: { from: Date; to: Date }[],
): { from: string; to: string }[] {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(monthIndex + 1);
  return gapWindows(`${year}-${mm}-01`, `${year}-${mm}-${pad(lastDay)}`, covered);
}

/* -------------------------------------------------------------------------- */
/* Habitap bulk-import confirmation helper (pure — no DB, no Playwright).       */
/* -------------------------------------------------------------------------- */

/**
 * Split invitees into those whose email appears in `visitorListText` (confirmed to have
 * landed on the Habitap event after a CSV import) and those that don't (need a one-by-one
 * retry). Case-insensitive substring match — the same signal the portal's visitor list
 * gives us. Pure + exported so the partial-import handling can be unit-tested without
 * driving the live portal. Favours delivery: anyone we can't confirm is treated as MISSING
 * and re-sent, since a re-sent invite is at worst a duplicate email whereas a silently
 * dropped person can't get into the building at all.
 */
export function partitionByEmailPresence<T extends { email: string }>(
  invitees: T[],
  visitorListText: string,
): { present: T[]; missing: T[] } {
  const text = visitorListText.toLowerCase();
  const present: T[] = [];
  const missing: T[] = [];
  for (const i of invitees) {
    (i.email && text.includes(i.email.toLowerCase()) ? present : missing).push(i);
  }
  return { present, missing };
}
