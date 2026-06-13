import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { getSgHolidaysForYear } from "@/lib/sg-public-holidays";

function parseUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMondayUTC(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return parseUTC(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
      .toISOString()
      .slice(0, 10),
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !hasAdminAccess(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("weekStart");

  const todayUTC = new Date();
  const currentWeekStart = getMondayUTC(todayUTC);
  const weekStart = param ? parseUTC(param) : currentWeekStart;

  const days: Date[] = Array.from({ length: 7 }, (_, i) =>
    parseUTC(
      new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + i))
        .toISOString()
        .slice(0, 10),
    ),
  );
  const weekEnd = days[6];
  const year = weekStart.getUTCFullYear();

  // Public holidays for the week
  const dbHolidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: weekStart, lte: weekEnd }, countryCode: "SG" },
  });
  const staticHolidays = getSgHolidaysForYear(year);
  const holidaySet = new Set([
    ...staticHolidays,
    ...dbHolidays.map((h) => fmtKey(h.date)),
  ]);

  // All active employees with their timesheet entries + approved leaves for the week
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      employmentType: true,
      timesheetEntries: {
        where: { date: { gte: weekStart, lte: weekEnd } },
        select: { date: true, hours: true },
      },
      leaveRequests: {
        where: {
          status: "APPROVED",
          startDate: { lte: weekEnd },
          endDate: { gte: weekStart },
        },
        select: { startDate: true, endDate: true, leaveType: { select: { name: true, code: true } } },
      },
    },
  });

  // Only show weekend and public holiday columns
  const nonWorkDays = days.filter((d) => {
    const key = fmtKey(d);
    return d.getUTCDay() === 0 || d.getUTCDay() === 6 || holidaySet.has(key);
  });

  const dayHeaders = nonWorkDays.map((d) => ({
    date: fmtKey(d),
    dayName: DAY_NAMES[d.getUTCDay()],
    isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
    isPublicHoliday: holidaySet.has(fmtKey(d)),
  }));

  const todayKey = fmtKey(getMondayUTC(todayUTC)) === fmtKey(weekStart)
    ? fmtKey(todayUTC)
    : null;

  // Fetch timesheet entries with status for non-work days
  const allEntries = await prisma.timesheetEntry.findMany({
    where: {
      date: { gte: weekStart, lte: weekEnd },
      employeeId: { in: employees.map((e) => e.id) },
    },
    select: { employeeId: true, date: true, hours: true, status: true },
  });
  const entryByEmpDate = new Map(
    allEntries.map((e) => [`${e.employeeId}__${fmtKey(e.date)}`, e]),
  );

  const rows = employees.map((emp) => {

    // Build leave coverage set
    const leaveCoveredDates = new Map<string, string>(); // date → leave type name
    for (const lr of emp.leaveRequests) {
      let cur = new Date(Date.UTC(lr.startDate.getUTCFullYear(), lr.startDate.getUTCMonth(), lr.startDate.getUTCDate()));
      const end = new Date(Date.UTC(lr.endDate.getUTCFullYear(), lr.endDate.getUTCMonth(), lr.endDate.getUTCDate()));
      while (cur <= end) {
        leaveCoveredDates.set(cur.toISOString().slice(0, 10), lr.leaveType.name);
        cur = new Date(cur.getTime() + 86400000);
      }
    }

    let totalHours = 0;
    let approved = 0;
    let pending = 0;

    const dayStatuses = nonWorkDays.map((d) => {
      const key = fmtKey(d);
      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      const isHoliday = holidaySet.has(key);
      const entry = entryByEmpDate.get(`${emp.id}__${key}`);
      const hours = entry ? Number(entry.hours) : null;
      const status = entry?.status ?? null;

      if (hours && hours > 0) {
        totalHours += hours;
        if (status === "APPROVED") approved++;
        else if (status === "PENDING") pending++;
      }

      return { date: key, hours, isWeekend, isHoliday, status };
    });

    const overallStatus =
      dayStatuses.every((d) => !d.hours || d.hours === 0)
        ? "na"
        : pending > 0 && approved === 0
        ? "pending"
        : approved > 0 && pending === 0
        ? "approved"
        : "mixed";

    return {
      id: emp.id,
      name: emp.name,
      employmentType: emp.employmentType,
      days: dayStatuses,
      totalHours,
      approved,
      pending,
      status: overallStatus,
    };
  });

  return NextResponse.json({
    weekStart: fmtKey(weekStart),
    currentWeekStart: fmtKey(currentWeekStart),
    todayKey,
    dayHeaders,
    rows,
    summary: {
      total: rows.length,
      approved: rows.filter((r) => r.status === "approved").length,
      pending: rows.filter((r) => r.status === "pending" || r.status === "mixed").length,
      none: rows.filter((r) => r.status === "na").length,
    },
  });
}
