import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildLeaveSummary, buildExpenseSummary, buildTimeOffSummary } from "@/lib/approval-summaries";
import { approvalResultPage, escapeHtml } from "@/lib/approval-result";

const bal = (code: string, name: string, paid: boolean, o: Partial<Record<"entitlement" | "used" | "pending" | "earned", number>> = {}) => ({
  entitlement: o.entitlement ?? 0,
  carriedOver: 0,
  used: o.used ?? 0,
  pending: o.pending ?? 0,
  earned: o.earned ?? 0,
  autoDeducted: 0,
  leaveType: { code, name, paid, defaultDays: o.entitlement ?? 0 },
});

describe("buildLeaveSummary", () => {
  it("totals paid leave, AL balance and NPL taken", () => {
    const s = buildLeaveSummary({
      employeeName: "ANG SEE SIANG",
      year: 2026,
      balances: [
        bal("AL", "Annual Leave", true, { entitlement: 14, used: 5 }),
        bal("MC", "Medical Leave", true, { entitlement: 14, used: 2 }),
        bal("NPL", "No Pay Leave", false, { used: 99 }),
        bal("CL", "Childcare Leave", true), // no activity → hidden
      ],
      profile: { startDate: new Date("2020-01-01"), endDate: null, monthlyLeaveRate: null, isIntern: false },
      npl: { cap: 17.5, used: 3, pending: 1, remaining: 13.5 },
      asOf: new Date("2026-11-12T00:00:00Z"),
    });
    // 12 Nov: 10 complete months → AL 14 × 10/12 = 11.67 → 11 earned, 5 taken → 6; MC the same → 11 − 2 = 9.
    expect(s.stats[0]).toMatchObject({ label: "Annual leave balance (prorated)", value: "6 days", hint: "11 of 14/yr earned · 5 taken" });
    expect(s.stats[1]).toMatchObject({ label: "MC balance (prorated)", value: "9 days", hint: "11 of 14/yr earned · 2 taken" });
    expect(s.stats[2]).toMatchObject({ label: "No Pay Leave balance", value: "13.5 days", hint: "17.5/yr, not prorated · 3 taken" });
    expect(s.stats[3]).toMatchObject({ label: "Paid leave taken", value: "7 days" });
    expect(s.table!.rows.map((r) => r[0])).toEqual(["Annual Leave", "Medical Leave", "No Pay Leave"]);
    // NPL figures come from the requests (npl status), not the stale balance row
    expect(s.table!.rows[2]).toEqual(["No Pay Leave", "3 days", "1 day", "13.5 days"]);
  });

  it("interns: MC balance is None (sick leave is No Pay Leave)", () => {
    const s = buildLeaveSummary({
      employeeName: "INTERN", year: 2026,
      balances: [bal("AL", "Annual Leave", true, { entitlement: 3, used: 0 }), bal("MC", "Medical Leave", true, { entitlement: 14 })],
      profile: { startDate: new Date("2026-01-01"), endDate: null, monthlyLeaveRate: null, isIntern: true },
      npl: { cap: 14, used: 0, pending: 0, remaining: 14 },
      asOf: new Date("2026-11-12T00:00:00Z"),
    });
    expect(s.stats[0]).toMatchObject({ value: "2 days" }); // 3 × 10/12 = 2.5 → 2
    expect(s.stats[1]).toMatchObject({ label: "MC balance (prorated)", value: "None" });
    expect(s.stats[2]).toMatchObject({ value: "14 days", hint: "14/yr, not prorated · 0 taken" });
  });
});

describe("buildExpenseSummary", () => {
  it("sums approved + paid with decimal precision and skips rejected", () => {
    const s = buildExpenseSummary("A", 2026, [
      { amount: 0.1, status: "APPROVED", category: { name: "Travel" } },
      { amount: 0.2, status: "PAID", category: { name: "Travel" } },
      { amount: 50, status: "PENDING", category: { name: "Meals" } },
      { amount: 999, status: "REJECTED", category: { name: "Meals" } },
    ]);
    expect(s.stats[0].value).toContain("0.30");
    expect(s.stats[0].hint).toBe("2 claims");
    expect(s.stats[1].value).toContain("0.20");
    expect(s.stats[2].value).toContain("50.00");
  });
});

describe("buildTimeOffSummary", () => {
  it("splits month vs year and pending hours", () => {
    const s = buildTimeOffSummary("I", 2026, 11, [
      { date: new Date("2026-11-03"), hours: 2, status: "APPROVED", reason: "MEDICAL" as never },
      { date: new Date("2026-10-03"), hours: 1.5, status: "APPROVED", reason: "MEDICAL" as never },
      { date: new Date("2026-11-20"), hours: 1, status: "PENDING", reason: "MEDICAL" as never },
    ]);
    expect(s.stats.map((x) => x.value)).toEqual(["2 h", "3.5 h", "1 h"]);
  });

  it("counts Off Days as days, outside the hour totals", () => {
    const s = buildTimeOffSummary("I", 2026, 11, [
      { date: new Date("2026-11-03"), hours: 2, status: "APPROVED", reason: "EXAMS" },
      { date: new Date("2026-11-05"), hours: 0, status: "APPROVED", reason: "OFF_DAY" },
      { date: new Date("2026-11-06"), hours: 0, status: "APPROVED", reason: "OFF_DAY" },
      { date: new Date("2026-11-20"), hours: 0, status: "PENDING", reason: "OFF_DAY" },
    ]);
    expect(s.stats.map((x) => x.value)).toEqual(["2 h", "2 h", "0 h", "2 (+1 pending)"]);
    expect(s.stats[3].label).toBe("Off Days in 2026");
    expect(s.table?.rows.map((r) => r[0])).toEqual(["Exams"]);
  });
});

describe("approvalResultPage", () => {
  it("escapes user text", async () => {
    expect(escapeHtml(`<b>"x"</b>`)).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    const html = await approvalResultPage({ tone: "approved", title: "Leave approved", message: "<script>x</script>" }).text();
    expect(html).not.toContain("<script>x");
    expect(html).toContain("Leave approved");
  });
});
