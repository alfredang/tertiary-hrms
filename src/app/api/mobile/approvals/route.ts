import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/approvals — the pending leave requests and expense claims
// awaiting action, for MANAGER/HR/ADMIN. Approve/reject actions reuse the
// existing web routes (/api/leave/[id]/approve etc.).
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [leaves, claims] = await Promise.all([
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
  ]);

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
  });
}
