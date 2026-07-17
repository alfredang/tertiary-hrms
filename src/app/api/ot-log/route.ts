import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedEmployeeId = searchParams.get("employeeId");

  const isAdmin = hasAdminAccess(session.user.role);

  // Non-admins can only fetch their own logs
  const employeeId =
    isAdmin && requestedEmployeeId ? requestedEmployeeId : session.user.employeeId;

  if (!employeeId) return NextResponse.json([], { status: 200 });

  const logs = await prisma.otWorkLog.findMany({
    where: { employeeId },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      date: l.date.toISOString(),
      type: l.type,
      note: l.note,
      daysEarned: Number(l.daysEarned),
      recordedBy: l.recordedBy,
      createdAt: l.createdAt.toISOString(),
    }))
  );
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user || !hasAdminAccess(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const log = await prisma.otWorkLog.findUnique({ where: { id } });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentYear = new Date(log.date).getFullYear();

  await prisma.$transaction(async (tx) => {
    await tx.otWorkLog.delete({ where: { id } });

    const alOtType = await tx.leaveType.findUnique({ where: { code: "AL_OT" } });
    if (alOtType) {
      const yearStart = new Date(Date.UTC(currentYear, 0, 1));
      const yearEnd   = new Date(Date.UTC(currentYear + 1, 0, 1));
      const remaining = await tx.otWorkLog.findMany({
        where: { employeeId: log.employeeId, date: { gte: yearStart, lt: yearEnd } },
        select: { daysEarned: true },
      });
      const recalcEarned = remaining.reduce((sum, l) => sum + Number(l.daysEarned), 0);
      await tx.leaveBalance.updateMany({
        where: { employeeId: log.employeeId, leaveTypeId: alOtType.id, year: currentYear },
        data: { earned: recalcEarned },
      });
    }
  });

  return NextResponse.json({ success: true });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !hasAdminAccess(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { employeeId, date, type, note, daysEarned } = body;

  if (!employeeId || !date || !type) {
    return NextResponse.json({ error: "employeeId, date, type are required" }, { status: 400 });
  }

  const days = Number(daysEarned ?? 1);
  const currentYear = new Date(date).getFullYear();

  const [log] = await prisma.$transaction(async (tx) => {
    const entry = await tx.otWorkLog.create({
      data: {
        employeeId,
        date: new Date(date),
        type,
        note: note ?? null,
        daysEarned: days,
        recordedBy: session.user.name ?? session.user.email ?? "Admin",
      },
    });

    const alOtType = await tx.leaveType.findUnique({ where: { code: "AL_OT" } });
    if (alOtType) {
      const yearStart = new Date(Date.UTC(currentYear, 0, 1));
      const yearEnd   = new Date(Date.UTC(currentYear + 1, 0, 1));
      const allLogs = await tx.otWorkLog.findMany({
        where: { employeeId, date: { gte: yearStart, lt: yearEnd } },
        select: { daysEarned: true },
      });
      const recalcEarned = allLogs.reduce((sum, l) => sum + Number(l.daysEarned), 0);

      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year: currentYear } },
        update: { earned: recalcEarned },
        create: { employeeId, leaveTypeId: alOtType.id, year: currentYear, entitlement: 0, earned: recalcEarned },
      });
    }

    return [entry];
  });

  return NextResponse.json({ id: log.id, daysEarned: days });
}
