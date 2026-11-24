import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";
import { toPunchDto, totalHoursOf } from "@/lib/attendance";
import { leaveBalanceAvailable } from "@/lib/leave-balance";
import { getLeaveProfile, getNplStatus } from "@/lib/leave-allowance";
import { leaveBalancePeriodWhere } from "@/lib/annual-leave-policy";
import { isMedicalLeaveCode, NPL_CODE } from "@/lib/leave-policy";
import { mustClockIn } from "@/lib/attendance-policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/employees/{id}/records — one person's full clock-in/out,
 * medical and leave history, for the Team tab's drill-down.
 *
 * Privacy: medical leave is health information, so only approvers
 * (ADMIN/HR/MANAGER — the roles that already see this on the web) may read
 * another employee's records. Anyone may read their own.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const { id } = await params;
  if (id !== ctx.employeeId && !ctx.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      name: true,
      position: true,
      employmentType: true,
      department: { select: { name: true } },
      user: { select: { roles: true } },
    },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const profile = await getLeaveProfile(id);
  const [punches, requests, balanceRows, npl, paybacks, claims] = await Promise.all([
    prisma.attendancePunch.findMany({
      where: { employeeId: id },
      orderBy: { date: "desc" },
      take: 1000,
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: id },
      include: {
        leaveType: { select: { name: true, code: true } },
        approver: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
      take: 500,
    }),
    prisma.leaveBalance.findMany({ where: { employeeId: id, ...leaveBalancePeriodWhere() }, include: { leaveType: true } }),
    getNplStatus(id, profile).catch(() => null),
    prisma.nplPayback.findMany({
      where: { employeeId: id },
      include: { approver: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.expenseClaim.findMany({
      where: { employeeId: id },
      include: { category: { select: { name: true, code: true } }, approver: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  // Annual leave, MC and No Pay Leave: taken (approved) and the balance out of the allowance.
  const pick = (match: (code: string) => boolean) => balanceRows.find((b) => match(b.leaveType.code));
  const balance = (kind: "AL" | "MC" | "NPL", label: string, b: (typeof balanceRows)[number] | undefined) => {
    if (kind === "NPL" && npl) {
      return { code: NPL_CODE, name: label, taken: npl.used, pending: npl.pending, available: npl.remaining, allowance: npl.cap };
    }
    if (!b) return null;
    const { available, proRated } = leaveBalanceAvailable(b, profile, npl);
    const allowance = (proRated ?? num(b.entitlement)) + (kind === "NPL" ? 0 : num(b.carriedOver));
    return { code: b.leaveType.code, name: label, taken: num(b.used), pending: num(b.pending), available, allowance };
  };
  const balances = [
    balance("AL", "Annual Leave", pick((c) => c === "AL")),
    balance("MC", "MC", pick((c) => isMedicalLeaveCode(c))),
    balance("NPL", "No Pay Leave", pick((c) => c === NPL_CODE)),
  ].filter((b) => b != null);

  return NextResponse.json({
    employee: {
      id: employee.id,
      employeeCode: employee.employeeId,
      name: employee.name,
      position: employee.position,
      department: employee.department?.name ?? null,
      employmentType: employee.employmentType,
    },
    intern: !!profile?.isIntern,
    mustClockIn: mustClockIn(employee.user?.roles),
    balances,
    attendance: {
      days: punches.map(toPunchDto),
      totalHours: totalHoursOf(punches),
      daysWorked: punches.filter((p) => p.clockIn).length,
    },
    // Same row shape as /api/mobile/leave so the app decodes one LeaveRequest type.
    leave: requests.map((r) => ({
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
    // No Pay Leave paybacks (an off day worked to pay back an NPL day), newest first.
    paybacks: paybacks.map((p) => ({
      id: p.id,
      nplDate: iso(p.nplDate),
      workDate: iso(p.workDate),
      days: num(p.days),
      note: p.note,
      status: p.status,
      approver: p.approver?.name ?? null,
      approvedAt: iso(p.approvedAt),
      rejectionReason: p.rejectionReason,
      createdAt: iso(p.createdAt),
    })),
    // Expense claims, the same row shape as /api/mobile/expenses.
    claims: claims.map((c) => ({
      id: c.id,
      description: c.description,
      amount: num(c.amount),
      currency: c.currency,
      category: c.category?.name ?? null,
      categoryCode: c.category?.code ?? null,
      expenseDate: iso(c.expenseDate),
      status: c.status,
      receiptUrl: c.receiptUrl,
      driveWebViewLink: c.driveWebViewLink,
      approver: c.approver?.name ?? null,
      approvedAt: iso(c.approvedAt),
      rejectionReason: c.rejectionReason,
      createdAt: iso(c.createdAt),
    })),
  });
}
