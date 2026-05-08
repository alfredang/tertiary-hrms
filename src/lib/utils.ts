import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateRange(start: Date | string, end: Date | string): string {
  const startDate = typeof start === "string" ? new Date(start) : start;
  const endDate = typeof end === "string" ? new Date(end) : end;

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function calculateDaysBetween(start: Date, end: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // Include both start and end day
}

/**
 * Count working days (Mon–Fri) between two dates, excluding weekends and
 * any dates listed in publicHolidays ("YYYY-MM-DD" strings in local time).
 * Both start and end are inclusive.
 */
export function calculateWorkingDays(
  start: Date,
  end: Date,
  publicHolidays: string[] = [],
): { workingDays: number; calendarDays: number; weekendDays: number; holidayDays: number } {
  const holidaySet = new Set(publicHolidays);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(0, 0, 0, 0);

  let workingDays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  let calendarDays = 0;

  while (cursor <= endNorm) {
    calendarDays++;
    const dow = cursor.getDay(); // 0=Sun, 6=Sat
    const iso = cursor.toISOString().slice(0, 10);
    if (dow === 0 || dow === 6) {
      weekendDays++;
    } else if (holidaySet.has(iso)) {
      holidayDays++;
    } else {
      workingDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { workingDays, calendarDays, weekendDays, holidayDays };
}

/** Returns "YYYY-MM-DD" in local time for a given Date. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns true if date is a weekend (Sat or Sun). */
export function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Round a number DOWN to the nearest 0.5
 * e.g., 3.2 → 3.0, 3.7 → 3.5, 3.8 → 3.5, 4.0 → 4.0
 */
export function roundToHalf(value: number): number {
  return Math.floor(value * 2) / 2;
}

/**
 * Check for leave date conflicts with AM/PM slot awareness.
 * Returns an array of formatted date strings where slots overlap.
 *
 * Rules:
 * - FULL_DAY occupies both AM and PM slots
 * - AM_HALF occupies AM slot only; PM_HALF occupies PM slot only
 * - Two half-day leaves on the same date are NOT allowed even if different slots — edit existing to full day instead
 * - Same-slot or complementary-slot: always conflicts (no stacking half-days on same date)
 * - Multi-day with halfDayPosition="first": first day = PM half, rest = FULL
 * - Multi-day with halfDayPosition="last": last day = AM half, rest = FULL
 */
export function getLeaveConflictDates(
  newStart: Date,
  newEnd: Date,
  _newDays: number,
  _newLeaveTypeCode: string,
  _newDayType: string,
  _newHalfDayPosition: string | null,
  existingLeaves: Array<{
    startDate: Date;
    endDate: Date;
    days: number;
    leaveTypeCode: string;
    dayType: string;
    halfDayPosition: string | null;
  }>
): string[] {
  // Build a set of all dates covered by existing leaves
  const coveredDates = new Set<string>();

  for (const leave of existingLeaves) {
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    const cursor = new Date(lStart);
    while (cursor <= lEnd) {
      coveredDates.add(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Check each date in the new request's range — any overlap is a conflict
  const conflicts: string[] = [];
  const cursor = new Date(newStart);

  while (cursor <= newEnd) {
    const key = cursor.toISOString().split("T")[0];

    if (coveredDates.has(key)) {
      conflicts.push(formatDate(new Date(key)));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return conflicts;
}

/** True for any supervisory role that can access admin views and features. */
export function hasAdminAccess(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "HR" || role === "MANAGER";
}

/**
 * Yearly AL entitlement based on completed years of service at Jan 1 of forYear.
 *   < 1 completed year → 12 days  (1 day/month, eligible after 6 months service)
 *   1 completed year   → 13 days
 *   2+ completed years → 14 days  (cap)
 */
export function computeYearlyEntitlement(
  startDate: Date,
  forYear: number = new Date().getFullYear(),
): number {
  const yearStart = new Date(forYear, 0, 1);
  if (startDate >= yearStart) return 12;
  const monthsAtJan1 =
    (yearStart.getFullYear() - startDate.getFullYear()) * 12 +
    (yearStart.getMonth() - startDate.getMonth());
  if (monthsAtJan1 >= 24) return 14;
  if (monthsAtJan1 >= 12) return 13;
  return 12;
}

/**
 * Full-year AL entitlement for an employee — the total days they will earn
 * by the end of the contract/year (not prorated to today).
 * Used to distinguish advance AL (within entitlement) from true deficit (beyond entitlement).
 */
export function computeAlFullEntitlement(
  startDate: Date | string | null | undefined,
  monthlyLeaveRate?: number | null,
): number {
  if (!startDate) return 12;
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const yearly = computeYearlyEntitlement(start);
  if (monthlyLeaveRate != null && monthlyLeaveRate < 12) return monthlyLeaveRate;
  return yearly;
}

/**
 * Prorated leave for the current year.
 *
 * When useALRules = true (Annual Leave):
 *   - No accrual until employee has completed 6 months total service
 *   - Yearly entitlement scales with seniority: 12 → 13 → 14 days (cap)
 *   - Accrues at entitlement/12 per month once eligible
 *
 * When useALRules = false (MC and other leave types):
 *   - Simple proration: annualEntitlement × elapsed months / 12
 *
 * Rounded to nearest 0.5 day.
 */
export function prorateLeave(
  annualEntitlement: number,
  employeeStartDate?: Date | string,
  monthlyLeaveRate?: number | null,
  useALRules: boolean = false,
): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);

  if (!employeeStartDate) {
    return roundToHalf((annualEntitlement * (now.getMonth() + 1)) / 12);
  }

  const startDate =
    typeof employeeStartDate === "string"
      ? new Date(employeeStartDate)
      : employeeStartDate;

  if (startDate > now) return 0;

  // Annual Leave rules
  if (useALRules) {
    const totalMonthsService =
      (now.getFullYear() - startDate.getFullYear()) * 12 +
      (now.getMonth() - startDate.getMonth()) + 1;

    // Day-based elapsed time (matches the period breakdown table)
    const effectiveStart = startDate > yearStart ? startDate : yearStart;
    const daysElapsed = (now.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24);
    const monthsElapsed = daysElapsed / 30.44;
    if (monthsElapsed <= 0) return 0;

    if (monthlyLeaveRate != null && monthlyLeaveRate < 6) {
      // Short contract (< 6 months): accrue 1 day/month up to admin-set total
      return Math.min(roundToHalf(monthsElapsed), monthlyLeaveRate);
    }

    // Long contract (>= 6 months), FT, or no rate set: accrue from month 1, no waiting period
    const yearlyEntitlement = computeYearlyEntitlement(startDate, currentYear);
    const accrued = (yearlyEntitlement / 12) * monthsElapsed;
    // Cap at monthlyLeaveRate when it's a fixed contract (< 12 days total)
    const cap = monthlyLeaveRate != null && monthlyLeaveRate < 12 ? monthlyLeaveRate : yearlyEntitlement;
    return Math.min(roundToHalf(accrued), cap);
  }

  // Standard proration (MC and other leave types)
  // Fixed-term contracts >= 10 months: cap MC at 12 days (no proration)
  if (monthlyLeaveRate != null && monthlyLeaveRate >= 10) return Math.min(annualEntitlement, 12);
  const effectiveStart = startDate > yearStart ? startDate : yearStart;
  const elapsed = now.getMonth() - effectiveStart.getMonth() + 1;
  if (elapsed <= 0) return 0;
  return roundToHalf((annualEntitlement * elapsed) / 12);
}
