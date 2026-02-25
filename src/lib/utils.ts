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
 * Determine which slot (AM, PM, or FULL) a leave occupies on a specific date.
 */
function getSlotForDate(
  dateKey: string,
  leaveStartKey: string,
  leaveEndKey: string,
  dayType: string,
  halfDayPosition: string | null,
): "AM" | "PM" | "FULL" {
  const isSingleDay = leaveStartKey === leaveEndKey;

  if (isSingleDay) {
    if (dayType === "AM_HALF") return "AM";
    if (dayType === "PM_HALF") return "PM";
    return "FULL";
  }

  // Multi-day: halfDayPosition indicates which day is the half day
  // "first" → first day is half-day (PM slot — work morning, leave afternoon)
  // "last" → last day is half-day (AM slot — leave morning, work afternoon)
  if (halfDayPosition === "first" && dateKey === leaveStartKey) return "PM";
  if (halfDayPosition === "last" && dateKey === leaveEndKey) return "AM";
  return "FULL";
}

/**
 * Check for leave date conflicts with AM/PM slot awareness.
 * Returns an array of formatted date strings where slots overlap.
 *
 * Rules:
 * - FULL_DAY occupies both AM and PM slots
 * - AM_HALF occupies AM slot only; PM_HALF occupies PM slot only
 * - Two half-day leaves on the same date are allowed if they use different slots (AM vs PM)
 * - Same-slot conflict: allowed only if different leave types AND at least one is medical (MC/SL)
 * - Multi-day with halfDayPosition="first": first day = PM half, rest = FULL
 * - Multi-day with halfDayPosition="last": last day = AM half, rest = FULL
 */
export function getLeaveConflictDates(
  newStart: Date,
  newEnd: Date,
  newDays: number,
  newLeaveTypeCode: string,
  newDayType: string,
  newHalfDayPosition: string | null,
  existingLeaves: Array<{
    startDate: Date;
    endDate: Date;
    days: number;
    leaveTypeCode: string;
    dayType: string;
    halfDayPosition: string | null;
  }>
): string[] {
  const MEDICAL_CODES = ["MC", "SL"];

  // Build a map of date → list of existing slot allocations
  type SlotEntry = { slot: "AM" | "PM" | "FULL"; code: string };
  const dateSlots = new Map<string, SlotEntry[]>();

  for (const leave of existingLeaves) {
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    const lStartKey = lStart.toISOString().split("T")[0];
    const lEndKey = lEnd.toISOString().split("T")[0];

    const cursor = new Date(lStart);
    while (cursor <= lEnd) {
      const key = cursor.toISOString().split("T")[0];
      const slot = getSlotForDate(key, lStartKey, lEndKey, leave.dayType, leave.halfDayPosition);
      const entries = dateSlots.get(key) || [];
      entries.push({ slot, code: leave.leaveTypeCode });
      dateSlots.set(key, entries);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Check each date in the new request's range
  const newStartKey = newStart.toISOString().split("T")[0];
  const newEndKey = newEnd.toISOString().split("T")[0];
  const conflicts: string[] = [];
  const cursor = new Date(newStart);

  while (cursor <= newEnd) {
    const key = cursor.toISOString().split("T")[0];
    const newSlot = getSlotForDate(key, newStartKey, newEndKey, newDayType, newHalfDayPosition);
    const existingEntries = dateSlots.get(key) || [];

    let hasConflict = false;

    for (const existing of existingEntries) {
      // FULL vs anything = conflict (unless medical exception for half + full)
      if (existing.slot === "FULL" || newSlot === "FULL") {
        hasConflict = true;
        break;
      }

      // Same slot (both AM or both PM) = conflict
      if (existing.slot === newSlot) {
        // Medical exception: different types, at least one is medical
        const isMedicalException =
          existing.code !== newLeaveTypeCode &&
          (MEDICAL_CODES.includes(existing.code) || MEDICAL_CODES.includes(newLeaveTypeCode));
        if (!isMedicalException) {
          hasConflict = true;
          break;
        }
      }
      // Different slots (AM vs PM) = no conflict
    }

    // Also check total allocation doesn't exceed 1.0
    if (!hasConflict && existingEntries.length > 0) {
      const existingTotal = existingEntries.reduce(
        (sum, e) => sum + (e.slot === "FULL" ? 1.0 : 0.5),
        0
      );
      const newAlloc = newSlot === "FULL" ? 1.0 : 0.5;
      if (existingTotal + newAlloc > 1.0) {
        hasConflict = true;
      }
    }

    if (hasConflict) {
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
