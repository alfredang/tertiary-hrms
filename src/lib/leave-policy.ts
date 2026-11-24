/**
 * Company leave policy — pure functions, no database access, so they run on the
 * server, in client components and in unit tests alike.
 *
 * Rules (user policy, Nov 2026):
 *  1. AL and MC are prorated strictly by COMPLETED months served this year:
 *     entitlement × monthsServed / 12, rounded DOWN to a whole day (Alfred, 24 Nov 2026:
 *     7 days, 9 months worked → 7 × 9 / 12 = 5.25 → 5). Only No Pay Leave is not prorated.
 *     A month counts once it is complete, measured from the join date (or 1 Jan
 *     for anyone who joined before this year). A partial month counts as 0.
 *       joined 1 Sep, today 9 Nov → Sep + Oct served → 2 months.
 *       joined 20 Sep, today 9 Nov → 20 Sep–19 Oct served → 1 month.
 *       joined last year, today 9 Nov → Jan…Oct → 10 months.
 *  2. AL is 7 days/year for staff, 3 for interns (Femina Jasmin and Amanda Halim: 7), set on
 *     each person's LeaveBalance.entitlement (Alfred, 24 Nov 2026). AL resets on 1 January;
 *     unused AL carries forward one year only (src/lib/al-rollover.ts). HARD RULE (Alfred, 24 Nov 2026): annual leave can never
 *     go negative. Staff and interns may take only the prorated AL earned to date (plus
 *     carried-over days and Off In Lieu); there is no advance AL and no switch to allow it.
 *     With no AL left they can only apply for No Pay Leave. Enforced at submission
 *     (evaluateAlRequest) and again at approval (alApprovalShortfall), on every path.
 *  3. No Pay Leave is capped at 14 days/year for staff and interns alike, with NO
 *     proration: the full 14 days are available from the first day (Alfred, 20 Nov 2026).
 *     A No Pay Leave day paid back by working an off day (approved payback) no longer
 *     counts as taken (src/lib/npl-payback.ts).
 *  5. Part-time staff (Employee.employmentType PART_TIME) have no annual leave, no MC and no
 *     No Pay Leave: all three are 0 (Alfred, 24 Nov 2026). Compassionate leave is unchanged.
 *  4. Interns (roles exactly ["INTERN"]) have no paid MC — their sick leave is
 *     No Pay Leave.
 */

/** Staff AL days a year (LeaveType AL defaultDays). */
export const AL_DEFAULT_DAYS = 7;
/** Intern AL days a year (LeaveType AL internDefaultDays). */
export const AL_INTERN_DEFAULT_DAYS = 3;
export const NPL_ANNUAL_CAP_DAYS = 14;

/** Part-time staff have no AL, MC or No Pay Leave (Alfred, 24 Nov 2026). */
export function isPartTimeEmployment(employmentType: string | null | undefined): boolean {
  return employmentType === "PART_TIME";
}

/** Yearly No Pay Leave cap for a person: 14, or 0 for part-time staff. */
export function nplAnnualCap(isPartTime: boolean | undefined): number {
  return isPartTime ? 0 : NPL_ANNUAL_CAP_DAYS;
}

/** Leave types a part-time staff member cannot apply for. */
export function partTimeHasNoLeave(code: string | null | undefined): boolean {
  return code === "AL" || code === NPL_CODE || isMedicalLeaveCode(code);
}

export const PART_TIME_NO_LEAVE_MESSAGE =
  "Part-time staff have no annual leave, MC or No Pay Leave. Please speak to HR about time away from work.";
/** Share of the NPL cap at which admins get a "nearing the cap" alert. */
export const NPL_WARN_RATIO = 0.8;

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

/** Round DOWN to a whole day — the AL proration rule (Alfred, 24 Nov 2026). */
export function floorToWhole(value: number): number {
  return Math.floor(value + 1e-9);
}

/**
 * Prorated AL and MC: annual days × completed months worked / 12, rounded DOWN to a whole day
 * (Alfred, 24 Nov 2026). e.g. AL 7 days, 9 months → 5.25 → 5; MC 14 days, 9 months → 10.5 → 10.
 * Staff and interns, calendar-year and contract ledgers alike. No Pay Leave is never prorated.
 */
export function prorateByMonths(annualDays: number, months: number): number {
  if (annualDays <= 0 || months <= 0) return 0;
  return Math.min(annualDays, floorToWhole((annualDays * Math.min(12, months)) / 12));
}

/** Per-employee AL cap (Employee.monthlyLeaveRate = contract leave days) — only ever lowers the entitlement. */
export function applyLeaveCap(value: number, annualDays: number, leaveCap?: number | null): number {
  const cap = leaveCap != null && leaveCap < 12 ? Math.min(leaveCap, annualDays) : annualDays;
  return Math.min(value, cap);
}

/** MC entitlement for the year before proration: interns get none. */
export function mcAnnualEntitlement(annualDays: number, isIntern: boolean): number {
  return isIntern ? 0 : annualDays;
}

// ── Request evaluation ──────────────────────────────────────────────────────

export interface AlRequestInput {
  days: number;
  /** Prorated AL earned to date + carried over − used − pending (may be negative). */
  earnedAvailable: number;
  /** Off In Lieu days available. */
  otAvailable: number;
  /** Off In Lieu days the employee asked to use. */
  otRequested: number;
}

export interface AlRequestResult {
  ok: boolean;
  otDaysUsed: number;
  /** Days AL cannot cover — must be applied for as No Pay Leave. */
  excessDays: number;
  /** Max days this request could be as AL (earned balance + OIL). */
  coverable: number;
}

/**
 * Decide how an AL request is covered: the prorated balance earned to date (never below 0)
 * plus Off In Lieu. HARD RULE: nothing else — no advance on AL still to be earned. Anything
 * uncovered is excess and must be applied for as No Pay Leave.
 */
export function evaluateAlRequest(input: AlRequestInput): AlRequestResult {
  const earned = Math.max(0, input.earnedAvailable);
  const otUsed = Math.max(0, Math.min(input.otRequested, input.otAvailable, input.days));
  const coverable = earned + otUsed;
  const excessDays = Math.max(0, input.days - coverable);
  return { ok: excessDays === 0, otDaysUsed: otUsed, excessDays, coverable };
}

/**
 * Approval-time check of the same hard rule: days of AL this approval would take beyond the
 * prorated balance earned to date (0 = fine). `earned` is the prorated entitlement earned to
 * date, `usedBefore` the AL already approved, `alDays` the AL days of this request (OIL excluded).
 */
export function alApprovalShortfall(input: { earned: number; carriedOver: number; usedBefore: number; alDays: number }): number {
  const left = Math.max(0, input.earned + input.carriedOver - input.usedBefore);
  return Math.max(0, input.alDays - left);
}

export interface AlNplSplit {
  al: { startDate: string; endDate: string; days: number; halfDayPosition: "first" | null };
  npl: { startDate: string; endDate: string; days: number };
}

/**
 * Split an AL request that runs past what annual leave covers into an AL part (the first working
 * days, up to `coverable`) and a No Pay Leave part (the rest of the range). The API recomputes AL
 * days from the AL dates, so the AL part always ends on a whole working day; a half day on the
 * last day stays with the NPL part. Dates are "YYYY-MM-DD". Returns null when there is nothing
 * to split (no excess, or AL can't cover even one day).
 */
export function splitAlExcess(input: {
  startDate: string;
  endDate: string;
  totalDays: number;
  coverable: number;
  halfDayPosition: "first" | "last" | null;
  holidays?: readonly string[];
}): AlNplSplit | null {
  const { startDate, endDate, totalDays, coverable, halfDayPosition } = input;
  if (coverable >= totalDays || startDate >= endDate) return null;
  const holidays = new Set(input.holidays ?? []);
  const working: string[] = [];
  for (let d = new Date(`${startDate}T00:00:00Z`), i = 0; i < 400; d = new Date(d.getTime() + 86400000), i++) {
    const key = d.toISOString().slice(0, 10);
    if (key > endDate) break;
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) working.push(key);
  }
  let alCount = 0;
  let alDays = 0;
  for (let i = 0; i < working.length - 1; i++) {
    const charge = halfDayPosition === "first" && i === 0 ? 0.5 : 1;
    if (alDays + charge > coverable) break;
    alDays += charge;
    alCount++;
  }
  if (alCount === 0) return null;
  return {
    al: { startDate, endDate: working[alCount - 1], days: alDays, halfDayPosition: halfDayPosition === "first" ? "first" : null },
    npl: { startDate: working[alCount], endDate, days: Math.max(0, totalDays - alDays) },
  };
}

export interface NplStatus {
  cap: number;
  /** Approved No Pay Leave days, less the days paid back by working an off day. */
  used: number;
  pending: number;
  remaining: number;
  /** Days paid back (approved payback), already taken off `used`. */
  paidBack?: number;
}

export function nplStatus(cap: number, used: number, pending: number, paidBack = 0): NplStatus {
  return { cap, used, pending, remaining: Math.max(0, cap - used - pending), ...(paidBack > 0 ? { paidBack } : {}) };
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
    `No Pay Leave is capped at ${status.cap} days a year. ` +
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
