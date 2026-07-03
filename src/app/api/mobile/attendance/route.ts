import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";
import { startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

function todaySgt(): Date {
  return startOfDay(toZonedTime(new Date(), TZ));
}

// GET /api/mobile/attendance — today's punch + last 7 days
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ today: null, recent: [] });

  const today = todaySgt();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const punches = await prisma.attendancePunch.findMany({
    where: { employeeId: ctx.employeeId, date: { gte: sevenDaysAgo } },
    orderBy: { date: "desc" },
  });

  const todayPunch = punches.find(
    (p) => startOfDay(p.date).getTime() === today.getTime(),
  ) ?? null;

  return NextResponse.json({
    today: todayPunch
      ? { id: todayPunch.id, clockIn: iso(todayPunch.clockIn), clockOut: iso(todayPunch.clockOut) }
      : null,
    recent: punches.map((p) => ({
      id: p.id,
      date: iso(p.date),
      clockIn: iso(p.clockIn),
      clockOut: iso(p.clockOut),
    })),
  });
}
