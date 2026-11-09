import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { applyLeaveCap, monthsEmployedInYear, monthsServedThisYear, prorateByMonths } from "./leave-policy";

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
    // Local date parts, not toISOString(): in UTC+8, local midnight is the previous UTC day,
    // which made 25 Dec match "2026-12-24" and miss Christmas.
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
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
 * Yearly AL entitlement — flat value from company policy (configurable via leave settings).
 * The defaultDays parameter should come from the AL LeaveType record (default 7).
 */
export function computeYearlyEntitlement(
  _startDate: Date,
  _forYear: number = new Date().getFullYear(),
  defaultDays: number = 7,
): number {
  return defaultDays;
}

/**
 * Full-year AL entitlement for an employee — what they will have earned by 31 Dec
 * (or their contract end, if sooner): yearly days × completed months employed this
 * year / 12, rounded down to the half day, capped by the per-employee leave days.
 * Used to tell advance AL (within entitlement) from leave that must be No Pay Leave.
 */
export function computeAlFullEntitlement(
  startDate: Date | string | null | undefined,
  monthlyLeaveRate?: number | null,
  annualDays: number = 7,
  endDate?: Date | string | null,
  year: number = new Date().getFullYear(),
): number {
  const months = monthsEmployedInYear(startDate, year, endDate);
  return applyLeaveCap(prorateByMonths(annualDays, months), annualDays, monthlyLeaveRate);
}

/**
 * Leave earned to date this year (AL and MC alike — see src/lib/leave-policy.ts):
 *   annualEntitlement × completed months served this year / 12, rounded DOWN to 0.5.
 * Months are counted from the join date (or 1 Jan for earlier joiners); a partial
 * month counts only once it is complete. e.g. joined 1 Sep, today 9 Nov → 2 months →
 * 7 × 2/12 = 1.17 → 1 day of AL.
 *
 * useALRules = true additionally applies the per-employee leave-days cap
 * (Employee.monthlyLeaveRate < 12). MC has no cap and no "full entitlement for long
 * contracts" shortcut — it is prorated strictly too.
 */
export function prorateLeave(
  annualEntitlement: number,
  employeeStartDate?: Date | string | null,
  monthlyLeaveRate?: number | null,
  useALRules: boolean = false,
  asOf: Date = new Date(),
  endDate?: Date | string | null,
): number {
  const start = employeeStartDate ? new Date(employeeStartDate) : null;
  if (start && start > asOf) return 0;
  const months = monthsServedThisYear(start, asOf, endDate);
  const earned = prorateByMonths(annualEntitlement, months);
  return useALRules ? applyLeaveCap(earned, annualEntitlement, monthlyLeaveRate) : earned;
}
