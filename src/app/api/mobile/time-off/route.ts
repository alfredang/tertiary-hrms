import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/time-off — the signed-in employee's own time off requests.
// Submission, approval, rejection and cancellation all ride the existing
// /api/time-off* routes (same NextAuth session cookie) — this is read-only,
// reshaped for clean Kotlin/Swift decoding (Decimal -> number, Date -> ISO string).
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ requests: [] });

  const requests = await prisma.timeOffRequest.findMany({
    where: { employeeId: ctx.employeeId },
    include: { approver: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      date: iso(r.date),
      startTime: r.startTime,
      endTime: r.endTime,
      hours: num(r.hours),
      reason: r.reason,
      reasonDetail: r.reasonDetail,
      status: r.status,
      approver: r.approver?.name ?? null,
      approvedAt: iso(r.approvedAt),
      rejectedAt: iso(r.rejectedAt),
      rejectionReason: r.rejectionReason,
      createdAt: iso(r.createdAt),
    })),
  });
}
