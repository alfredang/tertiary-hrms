import { describe, expect, it } from "vitest";
import { annualLeaveAmounts, contractAccrualPeriods, contractLeaveEarned, leaveBalancePeriodWhere, withinAnnualLeavePeriod } from "../annual-leave-policy";
import { evaluateAlRequest } from "../leave-policy";

const d = (day: string) => new Date(`${day}T00:00:00Z`);
const allocation = { entitlement: 7, used: 2, pending: 0, carriedOver: 0,
  periodStart: "2026-03-30", periodEnd: "2027-02-26" };

describe("Opt-in internship annual leave", () => {
  it("retains previously allocated days when a completed holiday is reconciled, without increasing the contract total", () => {
    const a = annualLeaveAmounts({ ...allocation, used: 5, pending: 0.5, recordedEarned: 5.5 }, null, d("2026-11-13"));
    expect(a).toMatchObject({ earned: 5.5, remaining: 0, fullEntitlement: 7, fullAvailable: 1.5 });
    const afterApproval = annualLeaveAmounts({ ...allocation, used: 5.5, pending: 0, recordedEarned: 5.5 }, null, d("2026-11-13"));
    expect(afterApproval.remaining).toBe(0);
    // Future accrual catches up naturally; the retained allocation is never added a second time.
    expect(annualLeaveAmounts({ ...allocation, used: 5.5, recordedEarned: 5.5 }, null, d("2027-01-31")).earned).toBe(6);
    expect(annualLeaveAmounts({ ...allocation, recordedEarned: 20 }, null, d("2026-11-13")).earned).toBe(7);
  });

  it("offers 3 advance days from the full 7-day internship, with 4 earned and 2 used", () => {
    const a = annualLeaveAmounts(allocation, null, d("2026-11-13"));
    expect(a).toEqual({ isContract: true, earned: 4, fullEntitlement: 7, remaining: 2, fullAvailable: 5 });
    expect(a.fullAvailable - a.remaining).toBe(3);
    const coverage = evaluateAlRequest({ days: 14, earnedAvailable: a.remaining, fullAvailable: a.fullAvailable,
      otAvailable: 2, otRequested: 2, useAdvance: true });
    expect(coverage).toMatchObject({ advanceDays: 3, otDaysUsed: 2, excessDays: 7, coverable: 7 });
  });

  it("keeps the same total and deductions after New Year", () => {
    const a = annualLeaveAmounts(allocation, null, d("2027-01-04"));
    expect(a.fullEntitlement).toBe(7);
    expect(a.fullAvailable).toBe(5);
    expect(a.earned).toBe(5.5);
    expect(a.remaining).toBe(3.5);
  });

  it("counts pending reservations; never grants a second pool to cover existing excess", () => {
    const a = annualLeaveAmounts({ ...allocation, used: 3, pending: 4.5 }, null, d("2026-11-13"));
    expect(a.fullAvailable).toBe(-0.5);
    expect(a.remaining).toBe(-3.5);
  });

  it("fully earns the agreed total when the contract finishes, including the last part-month", () => {
    expect(contractAccrualPeriods(allocation.periodStart, allocation.periodEnd)).toHaveLength(11);
    expect(contractLeaveEarned(7, allocation.periodStart, allocation.periodEnd, d("2027-02-27"))).toBe(7);
    expect(contractLeaveEarned(7, allocation.periodStart, allocation.periodEnd, d("2026-03-29"))).toBe(0);
  });

  it("keeps ordinary calendar-year proration for accounts without a configured period", () => {
    const a = annualLeaveAmounts({ entitlement: 7, used: 2, pending: 0, carriedOver: 0 },
      { startDate: "2026-03-30", endDate: "2027-02-26" }, d("2026-11-13"));
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
