import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";
import { toPunchDto, totalHoursOf } from "@/lib/attendance";

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
    },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const [punches, requests] = await Promise.all([
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
  ]);

  return NextResponse.json({
    employee: {
      id: employee.id,
      employeeCode: employee.employeeId,
      name: employee.name,
      position: employee.position,
      department: employee.department?.name ?? null,
      employmentType: employee.employmentType,
    },
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
  });
}
