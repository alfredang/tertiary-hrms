import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function otForHours(hours: number): number {
  if (hours >= 8) return 1;
  if (hours >= 4) return 0.5;
  return 0;
}

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  return session?.user && hasAdminAccess(role);
}

// GET /api/timesheet/admin?weekStart=YYYY-MM-DD
// Returns all pending/recent non-workday entries for admin review
export async function GET(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get("weekStart");

  let dateFilter: { gte?: Date; lte?: Date } = {};
  if (weekStartParam) {
    const [y, m, d] = weekStartParam.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(y, m - 1, d + 6));
    dateFilter = { gte: start, lte: end };
  } else {
    // Default: last 30 days
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = { gte: start, lte: end };
  }

  const entries = await prisma.timesheetEntry.findMany({
    where: {
      date: dateFilter,
      hours: { gt: 0 },
    },
    include: {
      employee: { select: { id: true, name: true, employeeId: true } },
    },
    orderBy: [{ date: "desc" }, { employee: { name: "asc" } }],
  });

  // Filter to only non-workday entries (weekends + PH)
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: dateFilter, countryCode: "SG" },
  });
  const holidayDates = new Set(holidays.map((h) => fmtKey(h.date)));

  const nonWorkEntries = entries.filter((e) => {
    const key = fmtKey(e.date);
    const day = e.date.getUTCDay();
    return day === 0 || day === 6 || holidayDates.has(key);
  });

  return NextResponse.json(nonWorkEntries.map((e) => ({
    id: e.id,
    employeeId: e.employee.id,
    employeeCode: e.employee.employeeId,
    employeeName: e.employee.name,
    date: fmtKey(e.date),
    dayName: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][e.date.getUTCDay()],
    isPublicHoliday: holidayDates.has(fmtKey(e.date)),
    hours: Number(e.hours),
    otCredited: Number(e.otCredited),
    status: e.status,
    adminComment: e.adminComment,
  })));
}

// POST /api/timesheet/admin  — approve or reject an entry
export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const body = await req.json();
  const { entryId, action, comment } = body as {
    entryId: string;
    action: "APPROVE" | "REJECT";
    comment?: string;
  };

  if (!entryId || !["APPROVE", "REJECT"].includes(action))
    return NextResponse.json({ error: "entryId and action required" }, { status: 400 });

  const entry = await prisma.timesheetEntry.findUnique({
    where: { id: entryId },
    include: { employee: true },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  if (action === "APPROVE") {
    const year = entry.date.getUTCFullYear();
    const oilEarned = otForHours(Number(entry.hours));

    await prisma.timesheetEntry.update({
      where: { id: entryId },
      data: { status: "APPROVED", adminComment: comment ?? null },
    });

    // Credit Off In Lieu balance
    if (oilEarned > 0) {
      const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
      if (alOtType) {
        // Recalculate earned from all approved OtWorkLog entries
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const yearEnd   = new Date(Date.UTC(year + 1, 0, 1));

        // Update OtWorkLog entry to mark it as approved (keep existing)
        const allLogs = await prisma.otWorkLog.findMany({
          where: { employeeId: entry.employeeId, date: { gte: yearStart, lt: yearEnd } },
          select: { daysEarned: true },
        });
        const recalcEarned = allLogs.reduce((sum, l) => sum + Number(l.daysEarned), 0);

        await prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: entry.employeeId,
              leaveTypeId: alOtType.id,
              year,
            },
          },
          update: { earned: recalcEarned },
          create: {
            employeeId: entry.employeeId,
            leaveTypeId: alOtType.id,
            year,
            entitlement: 0,
            earned: recalcEarned,
            used: 0,
          },
        });
      }
    }

    // Notify employee
    try {
      await prisma.notification.create({
        data: {
          userId: entry.employee.userId,
          title: "Off In Lieu Approved",
          message: `Your ${Number(entry.hours)}h on ${fmtKey(entry.date)} has been approved. ${oilEarned} Off In Lieu day(s) credited.${comment ? ` Note: ${comment}` : ""}`,
          type: "LEAVE_APPROVED",
          link: "/timesheet",
        },
      });
    } catch { /* non-critical */ }

  } else {
    // REJECT — remove OtWorkLog entry, mark rejected
    await prisma.timesheetEntry.update({
      where: { id: entryId },
      data: { status: "REJECTED", adminComment: comment ?? null, otCredited: 0 },
    });

    await prisma.otWorkLog.deleteMany({
      where: { employeeId: entry.employeeId, date: entry.date },
    });

    // Notify employee
    try {
      await prisma.notification.create({
        data: {
          userId: entry.employee.userId,
          title: "Off In Lieu Rejected",
          message: `Your ${Number(entry.hours)}h on ${fmtKey(entry.date)} was not approved.${comment ? ` Reason: ${comment}` : ""}`,
          type: "LEAVE_REJECTED",
          link: "/timesheet",
        },
      });
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ ok: true });
}
