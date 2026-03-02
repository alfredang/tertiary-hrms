import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateDaysBetween,
  formatCurrency,
  getInitials,
  prorateLeave,
  roundToHalf,
} from "@/lib/utils";

// ---- calculateDaysBetween ----

describe("calculateDaysBetween — inclusive day count", () => {
  it("should return 1 for same day", () => {
    const d = new Date(2026, 2, 15);
    expect(calculateDaysBetween(d, d)).toBe(1);
  });

  it("should return 2 for consecutive days", () => {
    expect(calculateDaysBetween(new Date(2026, 2, 15), new Date(2026, 2, 16))).toBe(2);
  });

  it("should return 5 for Mon-Fri span", () => {
    expect(calculateDaysBetween(new Date(2026, 2, 16), new Date(2026, 2, 20))).toBe(5);
  });

  it("should handle reversed dates (uses Math.abs)", () => {
    const result = calculateDaysBetween(new Date(2026, 2, 20), new Date(2026, 2, 16));
    expect(result).toBe(5);
  });
});

// ---- formatCurrency ----

describe("formatCurrency — SGD formatting", () => {
  it("should format positive number with dollar sign", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("1,234.56");
  });

  it("should format zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0.00");
  });

  it("should format negative number with sign", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500.00");
    expect(result).toContain("-");
  });

  it("should format large number with commas", () => {
    const result = formatCurrency(102000);
    expect(result).toContain("102,000.00");
  });
});

// ---- getInitials ----

describe("getInitials — name abbreviation", () => {
  it("should return first letters of two words", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("should return first letter for single word", () => {
    expect(getInitials("Admin")).toBe("A");
  });

  it("should return first two letters for three+ words", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });
});

// ---- roundToHalf (supplemental — main tests in leave-api.test.ts) ----

describe("roundToHalf — floor to nearest 0.5", () => {
  it("should round down fractional values between .0 and .5", () => {
    expect(roundToHalf(3.2)).toBe(3.0);
    expect(roundToHalf(3.49)).toBe(3.0);
  });

  it("should keep exact .5 values", () => {
    expect(roundToHalf(3.5)).toBe(3.5);
  });

  it("should round down fractional values between .5 and 1.0", () => {
    expect(roundToHalf(3.7)).toBe(3.5);
    expect(roundToHalf(3.99)).toBe(3.5);
  });

  it("should keep whole numbers", () => {
    expect(roundToHalf(14.0)).toBe(14.0);
    expect(roundToHalf(0)).toBe(0);
  });
});

// ---- prorateLeave — deterministic with fake timers ----

describe("prorateLeave — March 15, 2026", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Pin: March 15, 2026 (currentMonth=2, i.e. March)
  // For existing employees: inclusive months = currentMonth - 0 + 1 = 3 (Jan, Feb, Mar)
  // For new hires: completed months = currentMonth - startMonth

  it("should give existing employee 14 AL → 14 * 3/12 = 3.5", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(14, new Date("2020-06-15"))).toBe(3.5);
  });

  it("should give existing employee 7 MC → 7 * 3/12 = 1.75 → 1.5", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(7, new Date("2020-06-15"))).toBe(1.5);
  });

  it("should give existing employee 0 NPL → 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(0, new Date("2020-06-15"))).toBe(0);
  });

  it("should give new hire (Feb 1) → 1 completed month → 14 * 1/12 = 1.17 → 1.0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(14, new Date(2026, 1, 1))).toBe(1);
  });

  it("should give new hire (Mar 1) → 0 completed months → 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(14, new Date(2026, 2, 1))).toBe(0);
  });

  it("should give new hire (Mar 15 = today) → 0 completed months → 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(14, new Date(2026, 2, 15))).toBe(0);
  });

  it("should give new hire (Jan 2) → 2 completed months → 14 * 2/12 = 2.33 → 2.0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    // Jan 2 > yearStart(Jan 1), so startedThisYear = true
    // completed = currentMonth(2) - startMonth(0) = 2
    expect(prorateLeave(14, new Date(2026, 0, 2))).toBe(2);
  });

  it("should treat no start date as existing employee", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    // No start date → effectiveStart = yearStart → not startedThisYear → inclusive 3 months
    expect(prorateLeave(14)).toBe(3.5);
  });

  it("should return 0 for future start date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    expect(prorateLeave(14, new Date(2027, 5, 1))).toBe(0);
  });

  it("should parse string date input correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
    // "2020-06-15" → existing employee → 3.5
    expect(prorateLeave(14, "2020-06-15")).toBe(3.5);
  });
});

describe("prorateLeave — December 15, 2026 (end of year)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should give existing employee full year → 14 * 12/12 = 14.0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 15));
    expect(prorateLeave(14, new Date("2020-06-15"))).toBe(14);
  });

  it("should give new hire Jan 2 → 11 completed months → 14 * 11/12 = 12.83 → 12.5", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 15));
    expect(prorateLeave(14, new Date(2026, 0, 2))).toBe(12.5);
  });
});

describe("prorateLeave — January 15, 2026 (start of year)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should give existing employee → 14 * 1/12 = 1.17 → 1.0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15));
    expect(prorateLeave(14, new Date("2020-06-15"))).toBe(1);
  });

  it("should give new hire Jan 2 → 0 completed months → 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15));
    // Jan 2 > yearStart → startedThisYear = true
    // completed = currentMonth(0) - startMonth(0) = 0
    expect(prorateLeave(14, new Date(2026, 0, 2))).toBe(0);
  });
});
