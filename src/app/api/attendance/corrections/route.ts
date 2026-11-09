import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { todaySgt } from "@/lib/attendance";
import { validateCorrection } from "@/lib/attendance-policy";

export const dynamic = "force-dynamic";

export interface CorrectionDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  kind: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  currentClockIn: string | null;
  currentClockOut: string | null;
  reason: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

/**
 * GET /api/attendance/corrections — own missing-punch requests.
 * Admins: ?scope=all (optionally &status=PENDING) for everyone's.
 */
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  const params = new URL(req.url).searchParams;
  const all = params.get("scope") === "all" && ctx.isAdmin;
  const status = params.get("status");

  const rows = await prisma.attendanceCorrection.findMany({
    where: {
      ...(all ? {} : { employeeId: ctx.employeeId ?? "__none__" }),
      ...(status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status) ? { status: status as "PENDING" } : {}),
    },
    orderBy: [{ status: "asc" }, { date: "desc" }],
    take: 200,
  });

  const empIds = Array.from(new Set(rows.map((r) => r.employeeId)));
  const [employees, punches] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true, employeeId: true } }),
    prisma.attendancePunch.findMany({
      where: { OR: rows.map((r) => ({ employeeId: r.employeeId, date: r.date })) },
      select: { employeeId: true, date: true, clockIn: true, clockOut: true },
    }),
  ]);
  const empById = new Map(employees.map((e) => [e.id, e]));

  const out: CorrectionDto[] = rows.map((r) => {
    const punch = punches.find((p) => p.employeeId === r.employeeId && p.date.getTime() === r.date.getTime());
    const e = empById.get(r.employeeId);
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: e?.name ?? "Unknown",
      employeeCode: e?.employeeId ?? "",
      date: r.date.toISOString().slice(0, 10),
      kind: r.kind,
      requestedClockIn: r.requestedClockIn?.toISOString() ?? null,
      requestedClockOut: r.requestedClockOut?.toISOString() ?? null,
      currentClockIn: punch?.clockIn?.toISOString() ?? null,
      currentClockOut: punch?.clockOut?.toISOString() ?? null,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
    };
  });
  return NextResponse.json(out);
}

/** POST /api/attendance/corrections — submit a missing clock-in / clock-out for one day. */
export async function POST(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ error: "No employee profile linked" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const date = String(body?.date ?? "").slice(0, 10);
  const existing = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? await prisma.attendancePunch.findUnique({
        where: { employeeId_date: { employeeId: ctx.employeeId, date: new Date(`${date}T00:00:00.000Z`) } },
        select: { clockIn: true, clockOut: true },
      })
    : null;

  const v = validateCorrection(
    { kind: body?.kind, date, clockInTime: body?.clockInTime, clockOutTime: body?.clockOutTime, reason: body?.reason },
    existing,
    todaySgt(),
  );
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const dup = await prisma.attendanceCorrection.findFirst({
    where: { employeeId: ctx.employeeId, date: v.date, status: "PENDING" },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json({ error: "You already have a pending correction for that day. Cancel it first to change it." }, { status: 400 });
  }

  const created = await prisma.attendanceCorrection.create({
    data: {
      employeeId: ctx.employeeId,
      date: v.date,
      kind: v.kind,
      requestedClockIn: v.clockIn,
      requestedClockOut: v.clockOut,
      reason: String(body.reason).trim().slice(0, 500),
    },
  });

  try {
    const [emp, approvers] = await Promise.all([
      prisma.employee.findUnique({ where: { id: ctx.employeeId }, select: { name: true } }),
      prisma.user.findMany({ where: { roles: { hasSome: ["ADMIN", "HR", "MANAGER"] } }, select: { id: true } }),
    ]);
    const what = v.kind === "BOTH" ? "clock-in and clock-out" : v.kind === "CLOCK_IN" ? "clock-in" : "clock-out";
    await prisma.notification.createMany({
      data: approvers.map((u) => ({
        userId: u.id,
        title: "Missing Punch Correction",
        message: `${emp?.name ?? "An employee"} submitted a missing ${what} for ${date}: ${created.reason}`,
        type: "ATTENDANCE_CORRECTION_SUBMITTED",
        link: "/attendance/overview",
      })),
    });
  } catch {
    // Non-critical
  }

  return NextResponse.json({ id: created.id }, { status: 201 });
}
