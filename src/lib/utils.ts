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

/**
 * Calculate prorated leave allocation (monthly accrual).
 * Allocation = annualEntitlement * elapsedMonths / 12
 *
 * For existing employees (started before this year):
 * - effectiveStart = Jan 1 → inclusive months (Jan=1, Feb=2, ...)
 *
 * For new hires (started this year):
 * - Uses completed months only (join month does NOT count)
 * - MOM formula: (completed months of service ÷ 12) × entitlement
 * - Note: MOM requires 3-month eligibility — we skip that (boss decision)
 *
 * Rounded down to nearest 0.5 day.
 *
 * Examples (entitlement = 14, current month = Feb):
 * - Existing employee → 14 * 2/12 = 2.33 → 2 (+ carry-over from last year)
 * - New hire joined Feb → 0 completed months → 0
 * - New hire joined Jan → 1 completed month → 14 * 1/12 = 1.17 → 1
 */
export function prorateLeave(annualEntitlement: number, employeeStartDate?: Date | string): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);

  let effectiveStart = yearStart;
  if (employeeStartDate) {
    const startDate = typeof employeeStartDate === "string" ? new Date(employeeStartDate) : employeeStartDate;
    if (startDate > yearStart) {
      effectiveStart = startDate;
    }
  }

  // If employee hasn't started yet, no leave
  if (effectiveStart > now) return 0;

  const currentMonth = now.getMonth(); // 0-indexed (Jan=0, Feb=1, ...)
  const startMonth = effectiveStart.getMonth(); // 0-indexed

  // Existing employees (started before this year): inclusive months from Jan
  // New hires (started this year): completed months only (join month doesn't count)
  const startedThisYear = effectiveStart > yearStart;
  const elapsedMonths = startedThisYear
    ? currentMonth - startMonth       // completed months (join month excluded)
    : currentMonth - startMonth + 1;  // inclusive (Jan=1, Feb=2, etc.)

  if (elapsedMonths <= 0) return 0;

  const prorated = (annualEntitlement * elapsedMonths) / 12;
  return roundToHalf(prorated);
}
