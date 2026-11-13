import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";
import { prorateLeave } from "@/lib/utils";
import { getLeaveProfile, getNplStatus } from "@/lib/leave-allowance";
import { isMedicalLeaveCode, mcAnnualEntitlement, NPL_CODE } from "@/lib/leave-policy";
import { annualLeaveAmounts, leaveBalancePeriodWhere } from "@/lib/annual-leave-policy";

export const dynamic = "force-dynamic";

// GET /api/mobile/leave — the signed-in employee's leave requests, balances, and types.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ balances: [], requests: [], types: [] });

  const employeeId = ctx.employeeId;

  const employee = await getLeaveProfile(employeeId);
  const [npl, types, balances, requests] = await Promise.all([
    getNplStatus(employeeId, employee).catch(() => null),
    prisma.leaveType.findMany({ orderBy: { name: "asc" } }),
    prisma.leaveBalance.findMany({ where: { employeeId, ...leaveBalancePeriodWhere() }, include: { leaveType: true } }),
    prisma.leaveRequest.findMany({
      where: { employeeId },
      include: {
        leaveType: { select: { name: true, code: true } },
        approver: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const balanceRows = balances.map((b) => {
    const isAL = b.leaveType.code === "AL";
    const isOT = b.leaveType.code === "AL_OT";
    const entitlement = num(b.entitlement);
    const carriedOver = num(b.carriedOver);
    const used = num(b.used);
    const pending = num(b.pending);
    const earned = num(b.earned);
    const autoDeducted = num(b.autoDeducted);

    let available: number;
    let proRated: number | null = null;
    if (isOT) {
      available = earned - used - autoDeducted - pending;
    } else if (isAL) {
      const amounts = annualLeaveAmounts({ entitlement: entitlement || b.leaveType.defaultDays, carriedOver, used, pending,
        periodStart: b.periodStart, periodEnd: b.periodEnd }, employee);
      proRated = amounts.earned;
      available = amounts.remaining;
    } else if (isMedicalLeaveCode(b.leaveType.code)) {
      // MC: prorated by completed months served; interns have none.
      proRated = prorateLeave(mcAnnualEntitlement(entitlement, !!employee?.isIntern), employee?.startDate, null, false, new Date(), employee?.endDate);
      available = proRated + carriedOver - used - pending;
    } else if (b.leaveType.code === NPL_CODE && npl) {
      // NPL: 21 days/year prorated by months served (not the balance row).
      proRated = npl.cap;
      available = npl.remaining;
    } else {
      available = entitlement + carriedOver - used - pending;
    }

    return {
      code: b.leaveType.code,
      name: b.leaveType.name,
      paid: b.leaveType.paid,
      entitlement,
      carriedOver,
      used,
      pending,
      earned,
      autoDeducted,
      proRated,
      ...(isAL && b.periodStart && b.periodEnd ? {
        periodStart: iso(b.periodStart), periodEnd: iso(b.periodEnd),
        fullAvailable: annualLeaveAmounts({ entitlement, carriedOver, used, pending, periodStart: b.periodStart, periodEnd: b.periodEnd }, employee).fullAvailable,
      } : {}),
      available: Math.round(available * 100) / 100,
    };
  });

  return NextResponse.json({
    balances: balanceRows,
    types: types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      paid: t.paid,
      defaultDays: t.defaultDays,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      leaveType: r.leaveType.name,
      leaveCode: r.leaveType.code,
      startDate: iso(r.startDate),
      endDate: iso(r.endDate),
      days: num(r.days),
      dayType: r.dayType,
      status: r.status,
      reason: r.reason,
      approver: r.approver?.name ?? null,
      approvedAt: iso(r.approvedAt),
      rejectionReason: r.rejectionReason,
      createdAt: iso(r.createdAt),
    })),
  });
}
