import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

// POST /api/mobile/attendance/clock-out
export async function POST() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId)
    return NextResponse.json({ error: "No employee profile linked" }, { status: 400 });

  const now = new Date();
  const today = startOfDay(toZonedTime(now, TZ));

  const existing = await prisma.attendancePunch.findUnique({
    where: { employeeId_date: { employeeId: ctx.employeeId, date: today } },
  });

  if (!existing?.clockIn) {
    return NextResponse.json({ error: "Not clocked in yet today" }, { status: 400 });
  }
  if (existing.clockOut) {
    return NextResponse.json({ error: "Already clocked out today" }, { status: 400 });
  }

  const punch = await prisma.attendancePunch.update({
    where: { id: existing.id },
    data: { clockOut: now },
  });

  return NextResponse.json({ id: punch.id, clockOut: punch.clockOut?.toISOString() ?? null });
}
