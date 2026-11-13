import { prorateLeave, computeAlFullEntitlement } from "./utils";
import { floorToHalf } from "./leave-policy";

type DateValue = Date | string;
export interface AnnualLeaveAllocation {
  entitlement: number;
  used: number;
  pending: number;
  carriedOver: number;
  /** Audited earned-to-date minimum retained when reconciling an existing contract pool. */
  recordedEarned?: number;
  periodStart?: DateValue | null;
  periodEnd?: DateValue | null;
}

interface LeaveEmployment {
  startDate?: DateValue | null;
  endDate?: DateValue | null;
  monthlyLeaveRate?: number | null;
}

export function leaveDate(value: DateValue): Date {
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00.000Z`);
}

function anniversary(start: Date, month: number): Date {
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, Math.min(start.getUTCDate(), lastDay)));
}

/** Monthly contract periods, including the final part-month, anchored to the join day. */
export function contractAccrualPeriods(startValue: DateValue, endValue: DateValue) {
  const start = leaveDate(startValue);
  const end = leaveDate(endValue);
  const until = new Date(end.getTime() + 86_400_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    throw new Error("Invalid annual leave entitlement period");
  }
  const periods: { start: Date; end: Date; until: Date }[] = [];
  // Limit malformed configuration to a maximum 100-year period.
  for (let month = 0; month < 1200; month++) {
    const from = anniversary(start, month);
    if (from >= until) return periods;
    const next = anniversary(start, month + 1);
    const periodUntil = next < until ? next : until;
    periods.push({ start: from, end: new Date(periodUntil.getTime() - 86_400_000), until: periodUntil });
  }
  throw new Error("Annual leave entitlement period is too long");
}

/** A fixed contract total accrues over its monthly periods, without a January reset. */
export function contractLeaveEarned(total: number, start: DateValue, end: DateValue, asOf: Date = new Date()): number {
  const periods = contractAccrualPeriods(start, end);
  const today = leaveDate(asOf);
  const complete = periods.filter((p) => p.until <= today).length;
  return Math.min(total, floorToHalf(total * complete / periods.length));
}

/** Shared by the form, server validation, dashboards and mobile balances. */
export function annualLeaveAmounts(balance: AnnualLeaveAllocation, employee?: LeaveEmployment | null, asOf: Date = new Date()) {
  const isContract = !!balance.periodStart && !!balance.periodEnd;
  const earned = isContract
    ? Math.min(balance.entitlement, Math.max(
      contractLeaveEarned(balance.entitlement, balance.periodStart!, balance.periodEnd!, asOf),
      balance.recordedEarned ?? 0,
    ))
    : prorateLeave(balance.entitlement, employee?.startDate, employee?.monthlyLeaveRate, true, asOf, employee?.endDate);
  const fullEntitlement = isContract
    ? balance.entitlement
    : computeAlFullEntitlement(employee?.startDate, employee?.monthlyLeaveRate, balance.entitlement, employee?.endDate, asOf.getFullYear());
  const deductions = balance.used + balance.pending;
  return {
    isContract, earned, fullEntitlement,
    remaining: earned + balance.carriedOver - deductions,
    fullAvailable: fullEntitlement + balance.carriedOver - deductions,
  };
}

export function withinAnnualLeavePeriod(balance: Pick<AnnualLeaveAllocation, "periodStart" | "periodEnd">, start: Date, end: Date): boolean {
  return (!balance.periodStart || leaveDate(start) >= leaveDate(balance.periodStart))
    && (!balance.periodEnd || leaveDate(end) <= leaveDate(balance.periodEnd));
}

/** Include active contract ledgers from an earlier year alongside this year's normal balances. */
export function leaveBalancePeriodWhere(asOf: Date = new Date()) {
  const today = leaveDate(asOf);
  return {
    OR: [
      { year: asOf.getFullYear(), periodStart: null, periodEnd: null },
      { periodStart: { lte: today }, periodEnd: { gte: today } },
    ],
  };
}
