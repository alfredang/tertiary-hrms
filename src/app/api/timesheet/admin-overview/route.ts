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

  const dayHeaders = days.map((d) => ({
    date: fmtKey(d),
    dayName: DAY_NAMES[d.getUTCDay()],
    isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
    isPublicHoliday: holidaySet.has(fmtKey(d)),
  }));

  const todayKey = fmtKey(getMondayUTC(todayUTC)) === fmtKey(weekStart)
    ? fmtKey(todayUTC)
    : null;

  const rows = employees.map((emp) => {
    const entryMap = new Map(emp.timesheetEntries.map((e) => [fmtKey(e.date), Number(e.hours)]));

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
    let missingWorkdays = 0;
    let submittedWorkdays = 0;
    let totalWorkdays = 0;

    const dayStatuses = days.map((d) => {
      const key = fmtKey(d);
      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      const isHoliday = holidaySet.has(key);
      const isNonWorkday = isWeekend || isHoliday;
      const onLeave = leaveCoveredDates.get(key);
      const hours = entryMap.get(key) ?? null;

      // Only count past/today workdays for compliance (future days not required yet)
      const isPastOrToday = key <= (todayKey ?? fmtKey(todayUTC));

      if (!isNonWorkday && !onLeave && isPastOrToday) {
        totalWorkdays++;
        if (hours !== null && hours >= 0) {
          submittedWorkdays++;
          totalHours += hours;
        } else {
          missingWorkdays++;
        }
      } else if (!isNonWorkday && !onLeave && hours !== null) {
        totalHours += hours;
      }

      return {
        date: key,
        hours,
        onLeave: onLeave ?? null,
        isWeekend,
        isHoliday,
      };
    });

    const status =
      totalWorkdays === 0
        ? "na"
        : missingWorkdays === 0
        ? "complete"
        : submittedWorkdays === 0
        ? "missing"
        : "partial";

    return {
      id: emp.id,
      name: emp.name,
      employmentType: emp.employmentType,
      days: dayStatuses,
      totalHours,
      submittedWorkdays,
      missingWorkdays,
      totalWorkdays,
      status,
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
      complete: rows.filter((r) => r.status === "complete").length,
      partial: rows.filter((r) => r.status === "partial").length,
      missing: rows.filter((r) => r.status === "missing").length,
    },
  });
}
