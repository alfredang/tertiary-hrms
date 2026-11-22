/**
 * Which notifications are still worth showing (Alfred, 22 Nov 2026: "keep only the important and
 * relevant notices and remove old ones, for every role"). Used by GET /api/notifications, so the web
 * bell and both phone apps show the same list. Nothing is deleted; stale rows are just not returned.
 *
 *  - Older than MAX_AGE_DAYS: gone.
 *  - Approval requests (leave / MC / time off / claims / payback / missed punch): only while the
 *    request is still PENDING. The request id travels in the link (`?request=<id>`); an older row
 *    without an id is kept for LEGACY_REQUEST_DAYS only.
 *  - Snapshot alerts (missed-punch roll-up, who is away today, compliance, QuickBooks health,
 *    reconciliation, finance to clear, timesheet reminder): only the newest of each type, and the
 *    "today" ones only on the day they were sent.
 *  - Exact repeats (same type, title, message and link): only the newest.
 */
export const MAX_AGE_DAYS = 30;
export const LEGACY_REQUEST_DAYS = 3;
export const MAX_RETURNED = 30;

export const REQUEST_TYPES = [
  "LEAVE_SUBMITTED", "TIME_OFF_SUBMITTED", "EXPENSE_SUBMITTED", "PAYBACK_SUBMITTED", "ATTENDANCE_CORRECTION_SUBMITTED",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** A newer one replaces the older ones. */
export const SNAPSHOT_TYPES = new Set([
  "ATTENDANCE_ROLLUP", "HR_COMPLIANCE", "QUICKBOOKS_HEALTH", "BANK_RECONCILIATION", "FINANCE_TO_CLEAR",
  "TIMESHEET_REMINDER", "AWAY_TODAY", "BIRTHDAY", "ATTENDANCE_MISSED",
]);
/** Only relevant on the (Singapore) day they were sent. */
export const TODAY_ONLY_TYPES = new Set(["AWAY_TODAY", "BIRTHDAY", "ATTENDANCE_MISSED"]);

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

/** `/leave?request=abc` → "abc". */
export function requestIdFromLink(link: string | null | undefined): string | null {
  const m = /[?&]request=([^&#]+)/.exec(link ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

export function linkWithRequest(path: string, id: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}request=${encodeURIComponent(id)}`;
}

const sgDay = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/**
 * `rows` newest first. `pending(type, id)`: is that request still waiting for a decision?
 */
export function pickRelevant<T extends NotificationRow>(
  rows: T[],
  pending: (type: RequestType, id: string) => boolean,
  now: Date = new Date(),
): T[] {
  const out: T[] = [];
  const seenSnapshot = new Set<string>();
  const seenExact = new Set<string>();
  const seenRequest = new Set<string>();
  const ageDays = (d: Date) => (now.getTime() - d.getTime()) / 86_400_000;
  for (const n of rows) {
    if (ageDays(n.createdAt) > MAX_AGE_DAYS) continue;
    const exact = `${n.type}|${n.title}|${n.message}|${n.link ?? ""}`;
    if (seenExact.has(exact)) continue;

    if ((REQUEST_TYPES as readonly string[]).includes(n.type)) {
      const id = requestIdFromLink(n.link);
      if (id) {
        if (seenRequest.has(id) || !pending(n.type as RequestType, id)) continue;
        seenRequest.add(id);
      } else if (ageDays(n.createdAt) > LEGACY_REQUEST_DAYS) {
        continue;
      }
    } else if (SNAPSHOT_TYPES.has(n.type)) {
      if (seenSnapshot.has(n.type)) continue;
      if (TODAY_ONLY_TYPES.has(n.type) && sgDay(n.createdAt) !== sgDay(now)) continue;
      seenSnapshot.add(n.type);
    }
    seenExact.add(exact);
    out.push(n);
    if (out.length >= MAX_RETURNED) break;
  }
  return out;
}
