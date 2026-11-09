import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { addDays, latestPeriod, sgtTodayIso } from "@/lib/reconciliation/service";

describe("latestPeriod", () => {
  it("is month-to-date of the latest imported statement row", () => {
    expect(latestPeriod("2026-11-07", "2026-11-09")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
  });
  it("falls back to today when nothing is imported", () => {
    expect(latestPeriod(null, "2026-11-09")).toEqual({ start: "2026-11-01", end: "2026-11-09" });
  });
  it("month override covers the whole month", () => {
    expect(latestPeriod("2026-11-07", "2026-11-09", "2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("date helpers", () => {
  it("addDays crosses month boundaries in UTC", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-11-01", -3)).toBe("2026-10-29");
  });
  it("sgtTodayIso is UTC+8", () => {
    expect(sgtTodayIso(Date.UTC(2026, 10, 8, 16, 30))).toBe("2026-11-09");
    expect(sgtTodayIso(Date.UTC(2026, 10, 8, 15, 59))).toBe("2026-11-08");
  });
});
