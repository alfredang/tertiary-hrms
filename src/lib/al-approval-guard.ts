/**
 * HARD RULE (Alfred, 24 Nov 2026): annual leave never goes negative. Submission already refuses
 * AL beyond the prorated balance earned to date (src/app/api/leave/route.ts); this re-checks at
 * approval, on every path (web, bulk, email link, app), so nothing approved can take the AL
 * balance below zero — e.g. a request submitted before the rule, or two requests racing.
 */
import { prisma } from "./prisma";
import { annualLeaveAmounts } from "./annual-leave-policy";
import { alApprovalShortfall } from "./leave-policy";

type Db = Pick<typeof prisma, "leaveBalance" | "employee">;

export interface AlApprovalBlock {
  error: string;
  code: "AL_EXCEEDS_BALANCE";
  shortfallDays: number;
}

/** Null when the request may be approved; otherwise the reason it may not. */
export async function alApprovalBlock(
  leave: {
    employeeId: string;
    leaveTypeId: string;
    days: unknown;
    otDaysUsed: unknown;
    balanceDays: unknown;
    balanceYear: number | null;
    createdAt: Date;
    leaveType: { code: string };
  },
  db: Db = prisma,
): Promise<AlApprovalBlock | null> {
  if (leave.leaveType.code !== "AL") return null;
  const isLedger = leave.balanceDays != null;
  const year = leave.balanceYear ?? (isLedger ? leave.createdAt.getFullYear() : new Date().getFullYear());
  const [balance, employee] = await Promise.all([
    db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: leave.employeeId, leaveTypeId: leave.leaveTypeId, year } },
    }),
    db.employee.findUnique({ where: { id: leave.employeeId }, select: { startDate: true, endDate: true, monthlyLeaveRate: true } }),
  ]);
  if (!balance) return null;

  const { earned } = annualLeaveAmounts({
    entitlement: Number(balance.entitlement), used: Number(balance.used), pending: Number(balance.pending),
    carriedOver: Number(balance.carriedOver), recordedEarned: Number(balance.earned),
    periodStart: balance.periodStart, periodEnd: balance.periodEnd,
  }, employee && { ...employee, monthlyLeaveRate: employee.monthlyLeaveRate != null ? Number(employee.monthlyLeaveRate) : null });

  // Same charge as submission: a contract ledger reserves only the AL part (balanceDays); a
  // calendar-year balance reserves all the days and Off In Lieu covers part of them.
  const charged = Number(leave.balanceDays ?? leave.days);
  const alDays = isLedger ? charged : Math.max(0, charged - Number(leave.otDaysUsed ?? 0));
  const shortfall = alApprovalShortfall({ earned, carriedOver: Number(balance.carriedOver), usedBefore: Number(balance.used), alDays });
  if (shortfall <= 0) return null;
  const left = Math.max(0, earned + Number(balance.carriedOver) - Number(balance.used));
  return {
    code: "AL_EXCEEDS_BALANCE",
    shortfallDays: shortfall,
    error:
      `Cannot approve: this annual leave needs ${alDays} day(s) but only ${left} day(s) of prorated annual leave are left. ` +
      `Annual leave cannot go negative — reject it and ask for the ${shortfall} day(s) beyond the balance as No Pay Leave.`,
  };
}
