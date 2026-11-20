// No Pay Leave payback (Alfred, 20 Nov 2026): a staff member or intern who took No Pay Leave can
// work one of their off days instead. Once an admin approves it, that day no longer counts as No
// Pay Leave taken, so the yearly balance goes back up (13 of 14 left → 14 of 14 left).
//
// Pure rules only (no database), shared by the API, the pages and the tests. Dates are the
// Singapore calendar day as "YYYY-MM-DD", the same day a @db.Date column stores at UTC midnight.
import { isScheduledWorkday } from "@/lib/attendance-policy";

export const PAYBACK_DAY_CHOICES = [1, 0.5] as const;

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export const dateOnly = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

/** "Sat, 7 Nov 2026" */
export function prettyDay(d: Date | string): string {
  const date = typeof d === "string" ? dateOnly(d) : d;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dayCountLabel(days: number): string {
  return days === 0.5 ? "Half day" : `${days} ${days === 1 ? "day" : "days"}`;
}

export interface NplDay {
  /** YYYY-MM-DD */
  date: string;
  /** No Pay Leave charged on this date: 1, or 0.5 for a half day. */
  days: number;
}

/**
 * The individual No Pay Leave days inside one leave request. Leave is charged on Mon–Fri that are
 * not public holidays (calculateWorkingDays), so those are the days listed; the amounts never add
 * up to more than the request's charged days (a trailing half day gets 0.5).
 */
export function nplDaysOfRequest(
  r: { startDate: Date; endDate: Date; days: number },
  holidays: ReadonlySet<string> = new Set(),
): NplDay[] {
  const all: string[] = [];
  const working: string[] = [];
  const end = dateOnly(ymd(r.endDate));
  for (let d = dateOnly(ymd(r.startDate)), i = 0; d <= end && i < 400; d = new Date(d.getTime() + 86400000), i++) {
    const key = ymd(d);
    all.push(key);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) working.push(key);
  }
  const dates = working.length > 0 ? working : all;
  let budget = Number(r.days);
  const out: NplDay[] = [];
  for (const date of dates) {
    if (budget <= 0) break;
    const days = Math.min(1, budget);
    out.push({ date, days });
    budget -= days;
  }
  return out;
}

/** An off day for this person: not one of their workdays (default Mon–Fri), or a public holiday. */
export function isOffDayFor(workdays: number[] | null | undefined, date: string, holidays: ReadonlySet<string> = new Set()): boolean {
  return holidays.has(date) || !isScheduledWorkday(workdays, dateOnly(date));
}

export interface PaybackCheck {
  /** Days being paid back by this request: 1 or 0.5. */
  days: number;
  /** The No Pay Leave day chosen, or undefined when the date is not one of the person's approved No Pay Leave days. */
  nplDay?: NplDay;
  /** Days of that No Pay Leave day already paid back or waiting for approval. */
  alreadyClaimed: number;
  /** YYYY-MM-DD of the off day worked. */
  workDate: string;
  workdays: number[] | null | undefined;
  holidays: ReadonlySet<string>;
  /** Days already paid back (approved or pending) by working on that same date. */
  workDateClaimed: number;
  /** That date already earned Off In Lieu, so it cannot be counted twice. */
  offInLieuOnWorkDate: boolean;
}

/** Why a payback request cannot be accepted, or null when it is fine. */
export function paybackProblem(c: PaybackCheck): string | null {
  if (!(PAYBACK_DAY_CHOICES as readonly number[]).includes(c.days)) return "Choose a full day or a half day.";
  if (!c.nplDay) return "That date is not one of your approved No Pay Leave days.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.workDate) || Number.isNaN(dateOnly(c.workDate).getTime())) return "Choose the off day you worked.";
  const outstanding = c.nplDay.days - c.alreadyClaimed;
  if (outstanding <= 0) return `Your No Pay Leave on ${prettyDay(c.nplDay.date)} has already been paid back or is waiting for approval.`;
  if (c.days > outstanding) return `Only ${dayCountLabel(outstanding).toLowerCase()} of your No Pay Leave on ${prettyDay(c.nplDay.date)} is left to pay back.`;
  if (c.workDate.slice(0, 4) !== c.nplDay.date.slice(0, 4)) {
    return "The off day worked must be in the same year as the No Pay Leave, because the No Pay Leave balance is counted per year.";
  }
  if (!isOffDayFor(c.workdays, c.workDate, c.holidays)) {
    return `${prettyDay(c.workDate)} is one of your normal working days. A payback day must be one of your off days or a public holiday.`;
  }
  if (c.offInLieuOnWorkDate) return `${prettyDay(c.workDate)} has already been counted for Off In Lieu, so it cannot also pay back No Pay Leave.`;
  if (c.workDateClaimed + c.days > 1) return `You have already used ${prettyDay(c.workDate)} to pay back No Pay Leave.`;
  return null;
}

/** "paid back" suffix for a calendar leave title; "" when nothing is paid back. */
export function paidBackSuffix(paidBack: number, days: number): string {
  if (paidBack <= 0) return "";
  if (paidBack >= days) return " ✅ Paid back";
  return ` (${paidBack} of ${days} days paid back)`;
}
