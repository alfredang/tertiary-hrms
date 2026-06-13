import { describe, expect, it } from "vitest";
import {
  DATE_PRESETS,
  MAX_WINDOW_DAYS,
  presetRange,
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
