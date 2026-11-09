/**
 * Intern attendance rules — pure functions (no database), shared by the
 * missed-punch cron, the correction API, the admin dashboard and tests.
 *
 * Dates follow AttendancePunch.date: the Singapore calendar day stored as UTC
 * midnight ("2026-11-09T00:00:00Z" is 9 Nov SGT). Times are real instants.
 */

export type CorrectionKind = "CLOCK_IN" | "CLOCK_OUT" | "BOTH";
export const CORRECTION_KINDS: CorrectionKind[] = ["CLOCK_IN", "CLOCK_OUT", "BOTH"];
/** How far back a missing punch may be corrected. */
export const CORRECTION_MAX_AGE_DAYS = 31;

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → the UTC-midnight Date used by @db.Date columns. */
export function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** A Singapore wall-clock time on a Singapore date, as an instant. Null if malformed. */
export function sgtInstant(dateYmd: string, hhmm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const d = new Date(`${dateYmd}T${hhmm}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO weekday 1 = Mon … 7 = Sun, matching Employee.workdays. */
export function isoWeekday(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

export function isScheduledWorkday(workdays: number[] | null | undefined, date: Date): boolean {
  const days = workdays && workdays.length > 0 ? workdays : [1, 2, 3, 4, 5];
  return days.includes(isoWeekday(date));
}

/** Monday (UTC-midnight date) of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - (isoWeekday(d) - 1));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ── Corrections ─────────────────────────────────────────────────────────────

export interface CorrectionInput {
  kind: string;
  date: string; // YYYY-MM-DD (SGT)
  clockInTime?: string | null; // HH:mm SGT
  clockOutTime?: string | null; // HH:mm SGT
  reason?: string | null;
}

export interface ExistingPunch {
  clockIn: Date | null;
  clockOut: Date | null;
}

export type CorrectionValidation =
  | { ok: true; kind: CorrectionKind; date: Date; clockIn: Date | null; clockOut: Date | null }
  | { ok: false; error: string };

/**
 * Validate a missing-punch request. `today` is today's SGT date (UTC midnight),
 * `now` the current instant. The resulting punch must have clock-out after clock-in.
 */
export function validateCorrection(
  input: CorrectionInput,
  existing: ExistingPunch | null,
  today: Date,
  now: Date = new Date(),
): CorrectionValidation {
  const kind = input.kind as CorrectionKind;
  if (!CORRECTION_KINDS.includes(kind)) return { ok: false, error: "Choose what is missing: clock-in, clock-out or both." };
  if (!input.reason || input.reason.trim().length < 3) return { ok: false, error: "Please give a short reason." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) return { ok: false, error: "Invalid date." };

  const date = dateOnly(input.date);
  if (date > today) return { ok: false, error: "You can't correct a future day." };
  if ((today.getTime() - date.getTime()) / 86_400_000 > CORRECTION_MAX_AGE_DAYS) {
    return { ok: false, error: `Corrections can only be made for the last ${CORRECTION_MAX_AGE_DAYS} days.` };
  }

  const wantIn = kind === "CLOCK_IN" || kind === "BOTH";
  const wantOut = kind === "CLOCK_OUT" || kind === "BOTH";
  const clockIn = wantIn ? sgtInstant(input.date, input.clockInTime ?? "") : null;
  const clockOut = wantOut ? sgtInstant(input.date, input.clockOutTime ?? "") : null;
  if (wantIn && !clockIn) return { ok: false, error: "Enter the clock-in time (HH:mm)." };
  if (wantOut && !clockOut) return { ok: false, error: "Enter the clock-out time (HH:mm)." };
  if ((clockIn && clockIn > now) || (clockOut && clockOut > now)) return { ok: false, error: "Times can't be in the future." };

  if (kind === "CLOCK_OUT" && existing?.clockOut) return { ok: false, error: "That day already has a clock-out." };
  if (kind === "CLOCK_IN" && existing?.clockIn) return { ok: false, error: "That day already has a clock-in." };
  if (kind === "CLOCK_OUT" && !existing?.clockIn) {
    return { ok: false, error: "There is no clock-in for that day — choose \"Both\" and enter both times." };
  }

  const finalIn = clockIn ?? existing?.clockIn ?? null;
  const finalOut = clockOut ?? existing?.clockOut ?? null;
  if (finalIn && finalOut && finalOut <= finalIn) return { ok: false, error: "Clock-out must be after clock-in." };

  return { ok: true, kind, date, clockIn, clockOut };
}

/** The punch times after an approved correction. */
export function applyCorrection(
  existing: ExistingPunch | null,
  correction: { requestedClockIn: Date | null; requestedClockOut: Date | null },
): ExistingPunch {
  return {
    clockIn: correction.requestedClockIn ?? existing?.clockIn ?? null,
    clockOut: correction.requestedClockOut ?? existing?.clockOut ?? null,
  };
}

// ── Missed punches ──────────────────────────────────────────────────────────

export interface InternRef {
  id: string;
  workdays: number[];
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface MissedPunch {
  employeeId: string;
  date: string; // YYYY-MM-DD
  kind: "NO_CLOCK_OUT" | "NO_CLOCK_IN";
}

/**
 * Interns who, on `date`, clocked in without clocking out, or did not clock in at
 * all on a scheduled workday. Skipped: public holidays, approved leave, days outside
 * the internship, and days that already have a pending/approved correction.
 */
export function findMissedPunches(args: {
  date: Date;
  interns: InternRef[];
  punches: Array<{ employeeId: string; date: Date; clockIn: Date | null; clockOut: Date | null }>;
  onLeave: Set<string>; // employeeIds on approved leave that day
  isPublicHoliday: boolean;
  corrected: Set<string>; // `${employeeId}|${YYYY-MM-DD}` with a pending/approved correction
}): MissedPunch[] {
  const key = ymd(args.date);
  const out: MissedPunch[] = [];
  for (const intern of args.interns) {
    if (args.corrected.has(`${intern.id}|${key}`)) continue;
    if (intern.startDate && ymd(intern.startDate) > key) continue;
    if (intern.endDate && ymd(intern.endDate) < key) continue;
    const punch = args.punches.find((p) => p.employeeId === intern.id && ymd(p.date) === key);
    if (punch?.clockIn && !punch.clockOut) {
      out.push({ employeeId: intern.id, date: key, kind: "NO_CLOCK_OUT" });
      continue;
    }
    if (punch?.clockIn) continue;
    if (args.isPublicHoliday || args.onLeave.has(intern.id)) continue;
    if (!isScheduledWorkday(intern.workdays, args.date)) continue;
    out.push({ employeeId: intern.id, date: key, kind: "NO_CLOCK_IN" });
  }
  return out;
}

/** Sum of completed-punch hours in [from, to), rounded to 2dp. */
export function hoursBetween(
  punches: Array<{ date: Date; clockIn: Date | null; clockOut: Date | null }>,
  from: Date,
  to: Date,
): number {
  let ms = 0;
  for (const p of punches) {
    if (p.date < from || p.date >= to || !p.clockIn || !p.clockOut) continue;
    ms += Math.max(0, p.clockOut.getTime() - p.clockIn.getTime());
  }
  return Math.round((ms / 3_600_000) * 100) / 100;
}
