import { describe, expect, it } from "vitest";
import {
  DATE_PRESETS,
  MAX_WINDOW_DAYS,
  isLastMondayOfMonth,
  lastMondayOfMonth,
  monthWindows,
  presetRange,
  upcomingMonthOf,
  windowDaysInclusive,
} from "@/lib/woods-square";

// Guards the date-window rules that the staff modal, admin card, and (now) the
// server-side validation all rely on. If an edit ever breaks the 7-day cap or the
// day-count math, these checks fail loudly instead of letting a bad window through.

describe("windowDaysInclusive", () => {
  it("counts a same-day window as 1 day", () => {
    expect(windowDaysInclusive("2026-06-09", "2026-06-09")).toBe(1);
  });

  it("counts the full span inclusively (9th–15th = 7 days)", () => {
    expect(windowDaysInclusive("2026-06-09", "2026-06-15")).toBe(7);
  });

  it("reports over-limit windows as more than the cap (9th–16th = 8 days)", () => {
    expect(windowDaysInclusive("2026-06-09", "2026-06-16")).toBe(MAX_WINDOW_DAYS + 1);
  });

  it("returns 0 when either end is missing", () => {
    expect(windowDaysInclusive("", "")).toBe(0);
    expect(windowDaysInclusive("2026-06-09", "")).toBe(0);
  });

  it("goes below 1 when the end is before the start (rejectable)", () => {
    expect(windowDaysInclusive("2026-06-15", "2026-06-09")).toBeLessThan(1);
  });
});

describe("presetRange", () => {
  it("every quick-pick stays within the 7-day cap", () => {
    for (const preset of DATE_PRESETS) {
      const { from, to } = presetRange(preset.from, preset.to);
      const days = windowDaysInclusive(from, to);
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
    }
  });

  it('the "1 week" preset is exactly 7 days', () => {
    const week = DATE_PRESETS.find((p) => p.label === "1 week")!;
    const { from, to } = presetRange(week.from, week.to);
    expect(windowDaysInclusive(from, to)).toBe(7);
  });

  it("returns ISO yyyy-MM-dd strings", () => {
    const { from, to } = presetRange(0, 6);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── Monthly scheduler helpers ────────────────────────────────────────────────

describe("lastMondayOfMonth", () => {
  it("finds the last Monday of July 2026 (27 Jul)", () => {
    const lm = lastMondayOfMonth(2026, 6); // monthIndex 6 = July
    expect(lm.getMonth()).toBe(6);
    expect(lm.getDate()).toBe(27);
    expect(lm.getDay()).toBe(1); // Monday
  });

  it("finds the last Monday of February 2026 (23 Feb)", () => {
    const lm = lastMondayOfMonth(2026, 1);
    expect(lm.getDate()).toBe(23);
    expect(lm.getDay()).toBe(1);
  });

  it("always lands on a Monday within the last 7 days of the month", () => {
    for (let m = 0; m < 12; m++) {
      const lm = lastMondayOfMonth(2026, m);
      const lastDay = new Date(2026, m + 1, 0).getDate();
      expect(lm.getDay()).toBe(1);
      expect(lm.getMonth()).toBe(m);
      expect(lm.getDate()).toBeGreaterThan(lastDay - 7);
    }
  });
});

describe("isLastMondayOfMonth", () => {
  it("is true only for the actual last Monday", () => {
    expect(isLastMondayOfMonth(new Date(2026, 6, 27))).toBe(true); // last Monday
    expect(isLastMondayOfMonth(new Date(2026, 6, 20))).toBe(false); // a Monday, but not the last
    expect(isLastMondayOfMonth(new Date(2026, 6, 26))).toBe(false); // a Sunday
  });
});

describe("monthWindows", () => {
  it("splits July (31 days) into 5 windows, last clamped to month-end", () => {
    const w = monthWindows(2026, 6);
    expect(w).toHaveLength(5);
    expect(w[0]).toEqual({ from: "2026-07-01", to: "2026-07-07" });
    expect(w[4]).toEqual({ from: "2026-07-29", to: "2026-07-31" });
  });

  it("splits February (28 days) into exactly 4 windows", () => {
    const w = monthWindows(2026, 1);
    expect(w).toHaveLength(4);
    expect(w[3]).toEqual({ from: "2026-02-22", to: "2026-02-28" });
  });

  it("covers every day with no window exceeding the 7-day cap", () => {
    const w = monthWindows(2026, 6);
    expect(w[0].from).toBe("2026-07-01");
    expect(w[w.length - 1].to).toBe("2026-07-31");
    for (const win of w) expect(windowDaysInclusive(win.from, win.to)).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
  });
});

describe("upcomingMonthOf", () => {
  it("returns the next month", () => {
    expect(upcomingMonthOf(new Date(2026, 6, 1))).toEqual({ year: 2026, monthIndex: 7 }); // Jul → Aug
  });

  it("rolls over December → January of the next year", () => {
    expect(upcomingMonthOf(new Date(2026, 11, 15))).toEqual({ year: 2027, monthIndex: 0 });
  });
});
