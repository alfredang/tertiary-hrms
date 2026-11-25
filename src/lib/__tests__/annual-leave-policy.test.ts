import { describe, expect, it } from "vitest";
import { annualLeaveAmounts, contractAccrualPeriods, contractLeaveEarned, leaveBalancePeriodWhere, withinAnnualLeavePeriod } from "../annual-leave-policy";
import { evaluateAlRequest } from "../leave-policy";

const d = (day: string) => new Date(`${day}T00:00:00Z`);
const allocation = { entitlement: 7, used: 2, pending: 0, carriedOver: 0,
  periodStart: "2026-03-30", periodEnd: "2027-02-26" };

describe("Contract annual leave ledger (7-day rate, ÷ 12, whole days)", () => {
  it("retains a reconciled allocation but never grants more than the rate earns", () => {
    // 13 Nov 2026: 7 complete months → 7 × 7 / 12 = 4.08 → 4; the audited 5.5 is kept.
    const a = annualLeaveAmounts({ ...allocation, used: 5, pending: 0.5, recordedEarned: 5.5 }, null, d("2026-11-13"));
    expect(a).toMatchObject({ earned: 5.5, remaining: 0, fullEntitlement: 6 });
    expect(annualLeaveAmounts({ ...allocation, used: 5.5, recordedEarned: 5.5 }, null, d("2027-01-31")).earned).toBe(5.5);
    expect(annualLeaveAmounts({ ...allocation, recordedEarned: 20 }, null, d("2026-11-13")).earned).toBe(7);
  });

  it("earns 7 × months / 12 rounded down to a whole day; AL covers only that (+ OIL)", () => {
    const a = annualLeaveAmounts(allocation, null, d("2026-11-13"));
    expect(a).toEqual({ isContract: true, earned: 4, fullEntitlement: 6, remaining: 2, fullAvailable: 4 });
    const coverage = evaluateAlRequest({ days: 14, earnedAvailable: a.remaining, otAvailable: 2, otRequested: 2 });
    expect(coverage).toMatchObject({ otDaysUsed: 2, excessDays: 10, coverable: 4 });
  });

  it("keeps accruing across New Year: 9 months → 5.25 → 5", () => {
    const a = annualLeaveAmounts(allocation, null, d("2027-01-04"));
    expect(a.earned).toBe(5);
    expect(a.remaining).toBe(3);
  });

  it("counts pending reservations", () => {
    const a = annualLeaveAmounts({ ...allocation, used: 3, pending: 4.5 }, null, d("2026-11-13"));
    expect(a.remaining).toBe(-3.5);
  });

  it("11 contract months earn 7 × 11 / 12 = 6.4 → 6, including the last part-month", () => {
    expect(contractAccrualPeriods(allocation.periodStart, allocation.periodEnd)).toHaveLength(11);
    expect(contractLeaveEarned(7, allocation.periodStart, allocation.periodEnd, d("2027-02-27"))).toBe(6);
    expect(contractLeaveEarned(7, allocation.periodStart, allocation.periodEnd, d("2026-03-29"))).toBe(0);
  });

  it("keeps ordinary calendar-year proration for accounts without a configured period", () => {
    const a = annualLeaveAmounts({ entitlement: 7, used: 2, pending: 0, carriedOver: 0 },
      { startDate: "2026-03-30", endDate: "2027-02-26" }, d("2026-11-13"));
    // 30 Mar → 13 Nov: 7 complete months → 7 × 7 / 12 = 4.08 → 4; whole year: 9 months → 5.25 → 5.
    expect(a).toMatchObject({ isContract: false, earned: 4, fullEntitlement: 5, remaining: 2, fullAvailable: 3 });
  });

  it("uses anchored month ends rather than overflowing a short month", () => {
    const periods = contractAccrualPeriods("2026-01-31", "2026-04-29");
    expect(periods.map((p) => p.start.toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("bounds requests to the configured contract and includes its original ledger in January", () => {
    expect(withinAnnualLeavePeriod(allocation, d("2026-12-11"), d("2027-01-01"))).toBe(true);
    expect(withinAnnualLeavePeriod(allocation, d("2027-02-26"), d("2027-03-01"))).toBe(false);
    expect(leaveBalancePeriodWhere(d("2027-01-04")).OR).toEqual([
      { year: 2027, periodStart: null, periodEnd: null },
      { periodStart: { lte: d("2027-01-04") }, periodEnd: { gte: d("2027-01-04") } },
    ]);
  });
});
