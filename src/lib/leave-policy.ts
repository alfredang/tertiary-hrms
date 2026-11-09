/**
 * Company leave policy — pure functions, no database access, so they run on the
 * server, in client components and in unit tests alike.
 *
 * Rules (user policy, Nov 2026):
 *  1. AL and MC are prorated strictly by COMPLETED months served this year:
 *     entitlement × monthsServed / 12, rounded DOWN to the nearest half day.
 *     A month counts once it is complete, measured from the join date (or 1 Jan
 *     for anyone who joined before this year). A partial month counts as 0.
 *       joined 1 Sep, today 9 Nov → Sep + Oct served → 2 months.
 *       joined 20 Sep, today 9 Nov → 20 Sep–19 Oct served → 1 month.
 *       joined last year, today 9 Nov → Jan…Oct → 10 months.
 *  2. AL default is 7 days/year. AL beyond what the employee has available must
 *     be applied for as No Pay Leave — the API rejects the excess with guidance.
 *  3. No Pay Leave is capped at 21 days/year, prorated the same way.
 *  4. Interns (roles exactly ["INTERN"]) have no paid MC — their sick leave is
 *     No Pay Leave.
 */

export const AL_DEFAULT_DAYS = 7;
export const NPL_ANNUAL_CAP_DAYS = 21;
/** Share of the NPL cap at which admins get a "nearing the cap" alert. */
export const NPL_WARN_RATIO = 0.8;
/**
 * Keep the opt-in "Use advance annual leave" toggle (commit 56a8dea): an employee
 * may borrow AL they will still earn by the end of this year/contract. Days
 * beyond the full-year entitlement are never allowed as AL — they must be NPL.
 * Set false to limit AL strictly to the balance earned to date.
 */
export const ALLOW_ADVANCE_AL = true;

export const MEDICAL_LEAVE_CODES = ["MC", "SL", "MEDICAL"] as const;
export const NPL_CODE = "NPL";

export function isMedicalLeaveCode(code: string | null | undefined): boolean {
  return !!code && (MEDICAL_LEAVE_CODES as readonly string[]).includes(code);
}

/** An intern is a user whose roles are exactly ["INTERN"] (admins also hold INTERN to switch views). */
export function isInternRoles(roles: readonly string[] | null | undefined): boolean {
  return !!roles && roles.length === 1 && roles[0] === "INTERN";
}

/** Round DOWN to the nearest 0.5 (never grants a part-day that has not been earned). */
export function floorToHalf(value: number): number {
  // Guard against float noise such as 6.999999 → 6.5
  return Math.floor(value * 2 + 1e-9) / 2;
}

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Whole months completed between `start` and `asOf` (start inclusive, asOf exclusive).
 * A month is complete on the same day-of-month as the start (clamped to the month's
 * last day): 1 Sep → 1 Oct is 1 month; 31 Jan → 28 Feb is 1 month.
 */
export function completedMonthsBetween(start: Date | string, asOf: Date | string): number {
  const s = toDate(start);
  const a = toDate(asOf);
  if (a <= s) return 0;
  let months = (a.getFullYear() - s.getFullYear()) * 12 + (a.getMonth() - s.getMonth());
  const anniversaryDay = Math.min(s.getDate(), daysInMonth(a.getFullYear(), a.getMonth()));
  if (a.getDate() < anniversaryDay) months -= 1;
  return Math.max(0, months);
}

/** Midnight (local) at the start of the given day. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Completed months served in `asOf`'s calendar year, counted from max(join date, 1 Jan)
 * up to today (exclusive) or the day after the contract end date, whichever is sooner.
 * 0 when the start date is unknown-in-the-future; 12 at most.
 */
export function monthsServedThisYear(
  startDate: Date | string | null | undefined,
  asOf: Date = new Date(),
  endDate?: Date | string | null,
): number {
  const year = asOf.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const start = startDate ? startOfDay(toDate(startDate)) : yearStart;
  const effectiveStart = start > yearStart ? start : yearStart;

  let until = startOfDay(asOf);
  if (endDate) {
    const end = startOfDay(toDate(endDate));
    const dayAfterEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    if (dayAfterEnd < until) until = dayAfterEnd;
  }
  return Math.min(12, completedMonthsBetween(effectiveStart, until));
}

/**
 * Completed months the employee will have served by the end of `year` (or their
 * contract end, if sooner) — the basis of the full-year entitlement.
 */
export function monthsEmployedInYear(
  startDate: Date | string | null | undefined,
  year: number = new Date().getFullYear(),
  endDate?: Date | string | null,
): number {
  const yearStart = new Date(year, 0, 1);
  const start = startDate ? startOfDay(toDate(startDate)) : yearStart;
  const effectiveStart = start > yearStart ? start : yearStart;
  // Up to 1 Jan next year (exclusive), or the day after the contract ends.
  let until = new Date(year + 1, 0, 1);
  if (endDate) {
    const end = startOfDay(toDate(endDate));
    const dayAfterEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    if (dayAfterEnd < until) until = dayAfterEnd;
  }
  return Math.min(12, completedMonthsBetween(effectiveStart, until));
}

/** entitlement × months / 12, rounded down to the nearest half day. */
export function prorateByMonths(annualDays: number, months: number): number {
  if (annualDays <= 0 || months <= 0) return 0;
  return floorToHalf((annualDays * Math.min(12, months)) / 12);
}

/** Per-employee AL cap (Employee.monthlyLeaveRate = contract leave days) — only ever lowers the entitlement. */
export function applyLeaveCap(value: number, annualDays: number, leaveCap?: number | null): number {
  const cap = leaveCap != null && leaveCap < 12 ? Math.min(leaveCap, annualDays) : annualDays;
  return Math.min(value, cap);
}

/** The prorated No Pay Leave cap for the months served so far this year. */
export function nplCapToDate(
  startDate: Date | string | null | undefined,
  asOf: Date = new Date(),
  endDate?: Date | string | null,
  annualCap: number = NPL_ANNUAL_CAP_DAYS,
): number {
  return prorateByMonths(annualCap, monthsServedThisYear(startDate, asOf, endDate));
}

/** MC entitlement for the year before proration: interns get none. */
export function mcAnnualEntitlement(annualDays: number, isIntern: boolean): number {
  return isIntern ? 0 : annualDays;
}

// ── Request evaluation ──────────────────────────────────────────────────────

export interface AlRequestInput {
  days: number;
  /** Earned to date + carried over − used − pending (may be negative). */
  earnedAvailable: number;
  /** Full-year entitlement + carried over − used − pending. */
  fullAvailable: number;
  /** Off In Lieu days available. */
  otAvailable: number;
  /** Off In Lieu days the employee asked to use. */
  otRequested: number;
  useAdvance: boolean;
  allowAdvance?: boolean;
}

export interface AlRequestResult {
  ok: boolean;
  otDaysUsed: number;
  advanceDays: number;
  /** Days AL cannot cover — must be applied for as No Pay Leave. */
  excessDays: number;
  /** Max days this request could be as AL (balance + advance + OIL). */
  coverable: number;
}

/** Decide how an AL request is covered. Anything uncovered is excess → NPL. */
export function evaluateAlRequest(input: AlRequestInput): AlRequestResult {
  const allowAdvance = input.allowAdvance ?? ALLOW_ADVANCE_AL;
  const earned = Math.max(0, input.earnedAvailable);
  const alCover = allowAdvance && input.useAdvance ? Math.max(earned, input.fullAvailable, 0) : earned;
  const otUsed = Math.max(0, Math.min(input.otRequested, input.otAvailable, input.days));
  const coverable = alCover + otUsed;
  const excessDays = Math.max(0, input.days - coverable);
  // OIL covers non-earned days first, so advance is what's left after OIL.
  const beyondEarned = Math.max(0, Math.min(input.days, coverable) - earned);
  const advanceDays = Math.max(0, beyondEarned - otUsed);
  return { ok: excessDays === 0, otDaysUsed: otUsed, advanceDays, excessDays, coverable };
}

export interface NplStatus {
  cap: number;
  used: number;
  pending: number;
  remaining: number;
}

export function nplStatus(cap: number, used: number, pending: number): NplStatus {
  return { cap, used, pending, remaining: Math.max(0, cap - used - pending) };
}

export function evaluateNplRequest(days: number, status: NplStatus): { ok: boolean; remaining: number } {
  return { ok: days <= status.remaining, remaining: status.remaining };
}

export function alExcessMessage(r: AlRequestResult, days: number, nplRemaining: number): string {
  const asAl = Math.max(0, r.coverable);
  return (
    `This request is ${days} day(s) but you only have ${asAl} day(s) of annual leave available` +
    `${r.otDaysUsed > 0 ? " (including Off In Lieu)" : ""}. ` +
    `Leave beyond your entitlement must be taken as No Pay Leave: shorten this request to ${asAl} day(s) ` +
    `and apply for the remaining ${r.excessDays} day(s) as No Pay Leave ` +
    `(you have ${nplRemaining} No Pay Leave day(s) left this year).`
  );
}

export function nplCapMessage(days: number, status: NplStatus): string {
  return (
    `No Pay Leave is capped at ${NPL_ANNUAL_CAP_DAYS} days a year, prorated to ${status.cap} day(s) for the months you have served. ` +
    `You have ${status.remaining} day(s) left (${status.used} taken, ${status.pending} pending), but this request is ${days} day(s).`
  );
}

export const INTERN_MC_MESSAGE =
  "Interns do not have paid medical leave. Please apply for No Pay Leave instead and attach your medical certificate.";

// ── Pattern helpers (used by the dashboard alerts and the compliance agent) ──

export interface SimpleLeave {
  startDate: Date;
  endDate: Date;
  days: number;
}

/**
 * MCs that start on a Monday or end on a Friday (weekend-adjacent). Leave dates
 * are stored as UTC midnight of the chosen day, so the UTC weekday is the real one.
 */
export function countWeekendAdjacentMcs(mcs: SimpleLeave[]): number {
  return mcs.filter((m) => m.startDate.getUTCDay() === 1 || m.endDate.getUTCDay() === 5).length;
}

export function countSingleDayMcs(mcs: SimpleLeave[]): number {
  return mcs.filter((m) => m.days <= 1).length;
}
