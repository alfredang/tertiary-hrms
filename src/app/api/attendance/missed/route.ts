import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { todaySgt } from "@/lib/attendance";
import { addDays } from "@/lib/attendance-policy";
import { getMissedPunches } from "@/lib/hr-insights";
import { isInternRoles } from "@/lib/leave-policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/attendance/missed — the signed-in employee's uncorrected missed punches
 * in the last 14 days (today excluded). Interns must clock in on every scheduled
 * workday, so they also see missing clock-ins; everyone sees forgotten clock-outs.
 */
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ isIntern: false, missed: [] });

  const e = await prisma.employee.findUnique({
    where: { id: ctx.employeeId },
    select: { id: true, workdays: true, startDate: true, endDate: true, user: { select: { roles: true } } },
  });
  if (!e) return NextResponse.json({ isIntern: false, missed: [] });

  const isIntern = isInternRoles(e.user?.roles);
  const today = todaySgt();
  const missed = await getMissedPunches([e], addDays(today, -14), today);
  return NextResponse.json({
    isIntern,
    missed: isIntern ? missed : missed.filter((m) => m.kind === "NO_CLOCK_OUT"),
  });
}
