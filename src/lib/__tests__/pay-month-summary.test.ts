import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { parseMonth, payMonthLeaveFigures } from "../pay-month-summary";

const u = (s: string) => new Date(`${s}T00:00:00Z`);
const req = (code: string, start: string, end: string, days: number, reason: string | null = null) => ({
  code, reason, startDate: u(start), endDate: u(end), days,
});

describe("payMonthLeaveFigures (Alfred, 26 Nov 2026)", () => {
  const rows = [
    req("AL", "2026-09-30", "2026-10-02", 3), // Wed–Fri: 1 day in Sep, 2 in Oct
    req("NPL", "2026-10-05", "2026-10-05", 1),
    req("NPL", "2026-10-06", "2026-10-07", 2, "Sick leave (MC) — fever"),
    req("MC", "2026-10-08", "2026-10-08", 0.5),
  ];
  it("interns: converted MC and MC requests are No Pay MC", () => {
    expect(payMonthLeaveFigures(rows, true, 10, 2026)).toEqual({ annualLeaveDays: 2, noPayLeaveDays: 1, mcDays: 2.5 });
  });
  it("staff: every No Pay Leave counts as such; MC is paid MC", () => {
    expect(payMonthLeaveFigures(rows, false, 10, 2026)).toEqual({ annualLeaveDays: 2, noPayLeaveDays: 3, mcDays: 0.5 });
  });
  it("splits a leave across months by working days", () => {
    expect(payMonthLeaveFigures(rows, false, 9, 2026).annualLeaveDays).toBe(1);
  });
  it("skips public holidays", () => {
    expect(payMonthLeaveFigures([req("NPL", "2026-10-05", "2026-10-06", 1)], false, 10, 2026, new Set(["2026-10-05"])).noPayLeaveDays).toBe(1);
  });
  it("parses months", () => {
    expect(parseMonth("2026-09")).toEqual({ year: 2026, month: 9 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth(null)).toBeNull();
  });
});
