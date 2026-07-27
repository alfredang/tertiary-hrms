import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { todaySgt, toPunchDto, punchHours } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// GET /api/attendance — today's punch + recent history for the signed-in employee
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId)
    return NextResponse.json({ today: null, recent: [], totalHours: 0, daysWorked: 0 });

  const days = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("days") ?? 7) || 7, 1),
    90,
  );

  const today = todaySgt();
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));

  const punches = await prisma.attendancePunch.findMany({
    where: { employeeId: ctx.employeeId, date: { gte: from } },
    orderBy: { date: "desc" },
  });

  const todayPunch =
    punches.find((p) => p.date.getTime() === today.getTime()) ?? null;

  const totalHours = punches.reduce(
    (sum, p) => sum + (punchHours(p.clockIn, p.clockOut) ?? 0),
    0,
  );

  return NextResponse.json({
    today: todayPunch ? toPunchDto(todayPunch) : null,
    recent: punches.map(toPunchDto),
    totalHours: Math.round(totalHours * 100) / 100,
    daysWorked: punches.filter((p) => p.clockIn).length,
  });
}
