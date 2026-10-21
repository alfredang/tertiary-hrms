import { describe, it, expect } from "vitest";
import {
  parseReportMonth,
  defaultReportMonthKey,
  countWorkingDaysUtc,
  leaveDaysInMonth,
  renderSummaryMarkdown,
} from "../leave-summary";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const oct = parseReportMonth("2026-10")!;
const noHolidays = new Set<string>();

describe("parseReportMonth", () => {
  it("parses a valid month", () => {
    expect(oct.key).toBe("2026-10");
    expect(oct.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(oct.end.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(parseReportMonth("2028-02")!.end.toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("rejects malformed input", () => {
    expect(parseReportMonth("2026-13")).toBeNull();
    expect(parseReportMonth("2026-1")).toBeNull();
    expect(parseReportMonth("Oct 2026")).toBeNull();
  });
});

describe("defaultReportMonthKey", () => {
  it("returns the previous month in SGT", () => {
    expect(defaultReportMonthKey(new Date("2026-11-01T01:00:00+08:00"))).toBe("2026-10");
    expect(defaultReportMonthKey(new Date("2026-01-01T00:30:00+08:00"))).toBe("2025-12");
    // 31 Oct 17:00 UTC is already 1 Nov in Singapore
    expect(defaultReportMonthKey(new Date("2026-10-31T17:00:00Z"))).toBe("2026-10");
  });
});

describe("countWorkingDaysUtc", () => {
  it("skips weekends and holidays", () => {
    // Mon 26 Oct – Sun 1 Nov 2026
    expect(countWorkingDaysUtc(d("2026-10-26"), d("2026-11-01"), noHolidays)).toBe(5);
    expect(countWorkingDaysUtc(d("2026-10-26"), d("2026-11-01"), new Set(["2026-10-28"]))).toBe(4);
  });
});

describe("leaveDaysInMonth", () => {
  it("uses the stored days for a request inside the month", () => {
    expect(leaveDaysInMonth({ startDate: d("2026-10-05"), endDate: d("2026-10-06"), days: 1.5, halfDayPosition: "last" }, oct, noHolidays)).toBe(1.5);
  });

  it("returns 0 outside the month", () => {
    expect(leaveDaysInMonth({ startDate: d("2026-11-02"), endDate: d("2026-11-03"), days: 2, halfDayPosition: null }, oct, noHolidays)).toBe(0);
  });

  it("splits a request crossing the month end by working days", () => {
    // Thu 29 Oct – Tue 3 Nov: Oct has Thu+Fri = 2
    const req = { startDate: d("2026-10-29"), endDate: d("2026-11-03"), days: 4, halfDayPosition: null };
    expect(leaveDaysInMonth(req, oct, noHolidays)).toBe(2);
    expect(leaveDaysInMonth(req, parseReportMonth("2026-11")!, noHolidays)).toBe(2);
  });

  it("deducts the half day only on the side that holds it", () => {
    const req = { startDate: d("2026-10-29"), endDate: d("2026-11-03"), days: 3.5, halfDayPosition: "first" };
    expect(leaveDaysInMonth(req, oct, noHolidays)).toBe(1.5);
    expect(leaveDaysInMonth(req, parseReportMonth("2026-11")!, noHolidays)).toBe(2);
  });
});

describe("renderSummaryMarkdown", () => {
  it("renders staff and intern tables", () => {
    const md = renderSummaryMarkdown({
      companyName: "Acme",
      month: "2026-10",
      generatedAt: "2026-11-01T01:00:00.000Z",
      totals: {
        headcount: { staff: 1, interns: 1, total: 2 },
        byLeaveType: [
          { code: "AL", name: "Annual Leave", approvedDays: 2, pendingDays: 0, employeesOnLeave: 1 },
          { code: "MC", name: "Medical Leave", approvedDays: 1, pendingDays: 1, employeesOnLeave: 1 },
        ],
        mc: { approvedDays: 1, pendingDays: 1, employeesOnMc: 1 },
        timeOff: { approvedHours: 3, pendingHours: 0 },
      },
      employees: [
        { employeeId: "E0001", name: "Alice", category: "STAFF", leaveTaken: { AL: { approved: 2, pending: 0 } }, timeOff: null, balances: [{ code: "AL", available: 3 }] },
        { employeeId: "I0001", name: "Bob", category: "INTERN", leaveTaken: { MC: { approved: 1, pending: 1 } }, timeOff: { approvedHours: 3, pendingHours: 0 }, balances: [] },
      ],
    });
    expect(md).toContain("# Acme — Leave & MC Summary for 2026-10");
    expect(md).toContain("## Staff (1)");
    expect(md).toContain("| Alice | E0001 | 2 | - | 3 | - |");
    expect(md).toContain("## Interns (1)");
    expect(md).toContain("| Bob | I0001 | - | 1 (+1 pend.) | 3 | - | - |");
  });
});
