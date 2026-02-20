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
 * Calculate prorated leave allocation (monthly accrual).
 * Allocation = annualEntitlement * elapsedMonths / 12
 * - elapsedMonths = months from effective start to current month (inclusive)
 * - If employee started before Jan 1 of current year → effective start = Jan 1
 * - If employee started mid-year → effective start = their start month
 * Rounded down to nearest 0.5 day.
 *
 * Examples (entitlement = 14):
 * - Existing employee in Feb → 14 * 2/12 = 2.33 → 2
 * - Existing employee in Dec → 14 * 12/12 = 14
 * - New employee starting Mar, now in May → 14 * 3/12 = 3.5
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

  // Calculate elapsed months from effective start to current month (inclusive)
  const currentMonth = now.getMonth(); // 0-indexed (Jan=0, Feb=1, ...)
  const startMonth = effectiveStart.getMonth(); // 0-indexed
  const elapsedMonths = currentMonth - startMonth + 1;

  const prorated = (annualEntitlement * elapsedMonths) / 12;
  return roundToHalf(prorated);
}
