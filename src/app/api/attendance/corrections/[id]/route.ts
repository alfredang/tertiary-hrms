import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { applyCorrection } from "@/lib/attendance-policy";

export const dynamic = "force-dynamic";

/**
 * POST /api/attendance/corrections/:id  { action: "approve" | "reject" | "cancel", comment? }
 * approve/reject: admins (ADMIN/HR/MANAGER). Approving writes the requested times
 * onto that day's AttendancePunch. cancel: the requester, while still pending.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;
  const comment: string | undefined = body?.comment?.trim() || undefined;

  const c = await prisma.attendanceCorrection.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  if (c.status !== "PENDING") return NextResponse.json({ error: "Correction is not pending" }, { status: 400 });

  if (action === "cancel") {
    if (c.employeeId !== ctx.employeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.attendanceCorrection.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true });
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve, reject or cancel" }, { status: 400 });
  }
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const employee = await prisma.employee.findUnique({ where: { id: c.employeeId }, select: { userId: true } });
  const day = c.date.toISOString().slice(0, 10);

  if (action === "reject") {
    await prisma.attendanceCorrection.update({
      where: { id },
      data: { status: "REJECTED", approverId: ctx.employeeId ?? null, rejectedAt: new Date(), rejectionReason: comment ?? null },
    });
    if (employee) {
      await prisma.notification
        .create({
          data: {
            userId: employee.userId,
            title: "Missing Punch Rejected",
            message: `Your missing-punch correction for ${day} was rejected.${comment ? ` Reason: ${comment}` : ""}`,
            type: "ATTENDANCE_CORRECTION_REJECTED",
            link: "/attendance",
          },
        })
        .catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.attendancePunch.findUnique({
    where: { employeeId_date: { employeeId: c.employeeId, date: c.date } },
  });
  const next = applyCorrection(existing, c);
  if (next.clockIn && next.clockOut && next.clockOut <= next.clockIn) {
    return NextResponse.json({ error: "Approving would leave clock-out before clock-in. Reject it and ask for a new request." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.attendancePunch.upsert({
      where: { employeeId_date: { employeeId: c.employeeId, date: c.date } },
      create: { employeeId: c.employeeId, date: c.date, clockIn: next.clockIn, clockOut: next.clockOut },
      update: { clockIn: next.clockIn, clockOut: next.clockOut },
    }),
    prisma.attendanceCorrection.update({
      where: { id },
      data: { status: "APPROVED", approverId: ctx.employeeId ?? null, approvedAt: new Date() },
    }),
  ]);

  if (employee) {
    await prisma.notification
      .create({
        data: {
          userId: employee.userId,
          title: "Missing Punch Approved",
          message: `Your missing-punch correction for ${day} was approved and your attendance updated.${comment ? ` Note: ${comment}` : ""}`,
          type: "ATTENDANCE_CORRECTION_APPROVED",
          link: "/attendance",
        },
      })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
