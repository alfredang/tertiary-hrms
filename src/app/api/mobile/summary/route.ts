import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, num } from "@/lib/mobile-api";
import { prorateLeave } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/mobile/summary — the home dashboard snapshot.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01`);

  // Admin queue counts.
  let pendingLeaves = 0;
  let pendingClaims = 0;
  if (ctx.isAdmin) {
    [pendingLeaves, pendingClaims] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.expenseClaim.count({ where: { status: "PENDING" } }),
    ]);
  }

  // Personal balances.
  let alAvailable: number | null = null;
  let mcAvailable: number | null = null;
  let otRemaining: number | null = null;
  let expenseYtd = 0;
  let name: string | null = null;

  if (ctx.employeeId) {
    const employeeId = ctx.employeeId;
    const [employee, balances, approvedExpenses] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, startDate: true, monthlyLeaveRate: true } }),
      prisma.leaveBalance.findMany({ where: { employeeId, year }, include: { leaveType: true } }),
      prisma.expenseClaim.aggregate({ where: { employeeId, status: "APPROVED", createdAt: { gte: yearStart } }, _sum: { amount: true } }),
    ]);
    name = employee?.name ?? null;
    expenseYtd = num(approvedExpenses._sum.amount);

    for (const b of balances) {
      const entitlement = num(b.entitlement);
      const carriedOver = num(b.carriedOver);
      const used = num(b.used);
      const pending = num(b.pending);
      if (b.leaveType.code === "AL") {
        const proRated = prorateLeave(entitlement || b.leaveType.defaultDays, employee?.startDate ?? undefined, employee?.monthlyLeaveRate != null ? num(employee.monthlyLeaveRate) : null, true);
        alAvailable = Math.round((proRated + carriedOver - used - pending) * 100) / 100;
      } else if (b.leaveType.code === "MC") {
        mcAvailable = Math.round((entitlement + carriedOver - used - pending) * 100) / 100;
      } else if (b.leaveType.code === "AL_OT") {
        otRemaining = Math.round((num(b.earned) - used - num(b.autoDeducted) - pending) * 100) / 100;
      }
    }
  }

  return NextResponse.json({
    name,
    role: ctx.role,
    isAdmin: ctx.isAdmin,
    alAvailable,
    mcAvailable,
    otRemaining,
    expenseYtd,
    pendingLeaves,
    pendingClaims,
  });
}
