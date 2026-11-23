import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/approvals — the pending leave requests, expense claims and No Pay Leave
// paybacks (23 Nov 2026) awaiting action, for MANAGER/HR/ADMIN. Approve/reject actions reuse the
// existing web routes (/api/leave/[id]/approve etc.).
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [leaves, claims, paybacks] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: {
        employee: { select: { name: true } },
        leaveType: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.expenseClaim.findMany({
      where: { status: "PENDING" },
      include: {
        employee: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.nplPayback.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }).catch(() => []),
  ]);
  // The clock-in / clock-out on the off day worked, as evidence for the approver (as on the web page).
  const punches = paybacks.length
    ? await prisma.attendancePunch.findMany({
        where: { OR: paybacks.map((p) => ({ employeeId: p.employeeId, date: p.workDate })) },
        select: { employeeId: true, date: true, clockIn: true, clockOut: true },
      }).catch(() => [])
    : [];
  const sgTime = (d: Date) => d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" });
  const punchBy = new Map(punches.map((p) => [`${p.employeeId}|${iso(p.date)}`, p]));

  return NextResponse.json({
    leaves: leaves.map((r) => ({
      id: r.id,
      employee: r.employee.name,
      leaveType: r.leaveType.name,
      leaveCode: r.leaveType.code,
      startDate: iso(r.startDate),
      endDate: iso(r.endDate),
      days: num(r.days),
      dayType: r.dayType,
      reason: r.reason,
      documentUrl: r.documentUrl,
      createdAt: iso(r.createdAt),
    })),
    claims: claims.map((c) => ({
      id: c.id,
      employee: c.employee.name,
      category: c.category?.name ?? null,
      description: c.description,
      amount: num(c.amount),
      expenseDate: iso(c.expenseDate),
      receiptUrl: c.driveWebViewLink ?? c.receiptUrl,
      createdAt: iso(c.createdAt),
    })),
    paybacks: paybacks.map((p) => {
      const punch = punchBy.get(`${p.employeeId}|${iso(p.workDate)}`);
      return {
        id: p.id,
        employee: p.employee.name,
        nplDate: iso(p.nplDate),
        workDate: iso(p.workDate),
        days: num(p.days),
        note: p.note,
        clocked: punch?.clockIn ? `${sgTime(punch.clockIn)} – ${punch.clockOut ? sgTime(punch.clockOut) : "no clock-out"}` : null,
        createdAt: iso(p.createdAt),
      };
    }),
  });
}
