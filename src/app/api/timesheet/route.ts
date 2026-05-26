import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Parse "YYYY-MM-DD" as UTC midnight — avoids local-timezone shifts
function parseUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Format a UTC Date back to "YYYY-MM-DD"
function fmtKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing `d`, returned as UTC midnight
function getMondayUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  return parseUTC(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
      .toISOString()
      .slice(0, 10)
  );
}

function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

// A day is editable between 11:30 AM SGT (03:30 UTC) and 11:30 PM SGT (15:30 UTC).
// dateStr is "YYYY-MM-DD" in the SGT calendar day.
function isDayEditable(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const unlockUTC = Date.UTC(y, m - 1, d, 3, 30);  // 11:30 AM SGT = 03:30 UTC
  const lockUTC   = Date.UTC(y, m - 1, d, 15, 30); // 11:30 PM SGT = 15:30 UTC
  const now = Date.now();
  return now >= unlockUTC && now < lockUTC;
}

function otForHours(hours: number): number {
  if (hours >= 8) return 1;
  if (hours >= 4) return 0.5;
  return 0;
}

// OT days to deduct from balance for a weekday absence
// 0h = full day absent (1 day), 4h = half day absent (0.5), 8h = worked (0)
function absenceDeductForHours(hours: number): number {
  if (hours >= 8) return 0;
  if (hours >= 4) return 0.5;
  return 1;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.employeeId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("weekStart");

  const todayUTC = new Date();
  const currentWeekStart = getMondayUTC(todayUTC);
  const weekStart = param ? parseUTC(param) : currentWeekStart;

  // Build 7-day array (all UTC midnight)
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    return parseUTC(
      new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + i))
        .toISOString()
        .slice(0, 10)
    );
  });

  const weekEnd = days[6];

  const employeeId = session.user.employeeId;

  const [entries, holidays, approvedLeaves] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { employeeId, date: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.publicHoliday.findMany({
      where: { date: { gte: weekStart, lte: weekEnd }, countryCode: "SG" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);

  // Build set of dates covered by approved leave
  const leaveCoveredDates = new Set<string>();
  for (const lr of approvedLeaves) {
    let cur = new Date(Date.UTC(lr.startDate.getUTCFullYear(), lr.startDate.getUTCMonth(), lr.startDate.getUTCDate()));
    const end = new Date(Date.UTC(lr.endDate.getUTCFullYear(), lr.endDate.getUTCMonth(), lr.endDate.getUTCDate()));
    while (cur <= end) {
      leaveCoveredDates.add(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86400000);
    }
  }

  const entryMap = new Map(entries.map((e) => [fmtKey(e.date), e]));
  const holidayMap = new Map(holidays.map((h) => [fmtKey(h.date), h.name]));
  const isLocked = weekStart < currentWeekStart;

  return NextResponse.json({
    weekStart: fmtKey(weekStart),
    isLocked,
    days: days.map((d) => {
      const key = fmtKey(d);
      const entry = entryMap.get(key);
      const phName = holidayMap.get(key) ?? null;
      const isOnLeave = leaveCoveredDates.has(key);
      return {
        date: key,
        dayName: DAY_NAMES[d.getUTCDay()],
        isWeekend: isWeekendUTC(d),
        isPublicHoliday: !!phName,
        phName,
        isOnLeave,
        // Leave days are auto-zero; don't override a saved entry
        hours: isOnLeave ? 0 : (entry ? Number(entry.hours) : 0),
        otCredited: entry ? Number(entry.otCredited) : 0,
        // Leave days and locked weeks are never editable; current week unlocks 11:30 AM–10 PM SGT
        isEditable: !isLocked && !isOnLeave && isDayEditable(key),
      };
    }),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.employeeId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeId = session.user.employeeId;
  const body = await req.json();
  const { weekStart: weekStartStr, entries } = body as {
    weekStart: string;
    entries: Array<{ date: string; hours: number }>;
  };

  const todayUTC = new Date();
  const currentWeekStart = getMondayUTC(todayUTC);
  const weekStart = parseUTC(weekStartStr);

  if (weekStart < currentWeekStart) {
    return NextResponse.json({ error: "Cannot edit a past week" }, { status: 403 });
  }

  const weekEnd = parseUTC(
    new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6))
      .toISOString()
      .slice(0, 10)
  );

  const [holidays, existing] = await Promise.all([
    prisma.publicHoliday.findMany({
      where: { date: { gte: weekStart, lte: weekEnd }, countryCode: "SG" },
    }),
    prisma.timesheetEntry.findMany({
      where: { employeeId, date: { gte: weekStart, lte: weekEnd } },
    }),
  ]);

  const holidayDates = new Set(holidays.map((h) => fmtKey(h.date)));
  const existingMap = new Map(existing.map((e) => [fmtKey(e.date), e]));

  // Fetch approved leave requests covering this week (any type) to skip auto-deduction
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: weekEnd },
      endDate: { gte: weekStart },
    },
    select: { startDate: true, endDate: true },
  });

  // Build a set of dates covered by approved leave
  const leaveCoveredDates = new Set<string>();
  for (const lr of approvedLeaves) {
    const s = lr.startDate;
    const e = lr.endDate;
    // Walk day by day through the leave range
    let cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
    const end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
    while (cur <= end) {
      leaveCoveredDates.add(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86400000);
    }
  }

  let totalOtDiff = 0;
  let totalAbsenceDeductDiff = 0;
  const year = weekStart.getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    // Get current OT balance so we know if there's anything to deduct
    const alOtType = await tx.leaveType.findUnique({ where: { code: "AL_OT" } });
    const otBalance = alOtType
      ? await tx.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year } },
        })
      : null;
    const currentOtEarned = Number(otBalance?.earned ?? 0);
    const currentOtUsed = Number(otBalance?.used ?? 0);
    const currentOtAutoDeducted = Number(otBalance?.autoDeducted ?? 0);
    const currentOtPending = Number(otBalance?.pending ?? 0);
    // Running tally of used as we process entries (to avoid over-deducting within a single save)
    let runningUsedDelta = 0;

    for (const entry of entries) {
      const dateKey = entry.date.slice(0, 10);
      const d = parseUTC(dateKey);

      // Reject edits to days that haven't unlocked yet
      if (!isDayEditable(dateKey)) {
        const prev = Number(existingMap.get(dateKey)?.hours ?? 0);
        if (entry.hours !== prev) {
          throw new Error(`Day ${dateKey} is not editable (open 11:30 AM – 11:30 PM SGT)`);
        }
        continue;
      }

      const isOtDay = isWeekendUTC(d) || holidayDates.has(dateKey);
      const isWeekday = !isWeekendUTC(d) && !holidayDates.has(dateKey);

      const prevEntry = existingMap.get(dateKey);
      const prevOt = Number(prevEntry?.otCredited ?? 0);
      const prevAbsenceDeducted = Number(prevEntry?.otAbsenceDeducted ?? 0);

      const newOt = isOtDay ? otForHours(entry.hours) : 0;
      totalOtDiff += newOt - prevOt;

      // Auto-deduction logic for weekdays
      let newAbsenceDeducted = 0;
      if (isWeekday && !leaveCoveredDates.has(dateKey)) {
        const deductNeeded = absenceDeductForHours(entry.hours);
        if (deductNeeded > 0) {
          const availableOt = currentOtEarned - currentOtUsed - currentOtAutoDeducted - currentOtPending - runningUsedDelta;
          // Only deduct up to what's available (can't go negative)
          newAbsenceDeducted = Math.min(deductNeeded, Math.max(0, availableOt));
        }
        // Net diff: new deduction minus what was previously recorded for this day
        const diff = newAbsenceDeducted - prevAbsenceDeducted;
        if (diff !== 0) {
          totalAbsenceDeductDiff += diff;
          runningUsedDelta += diff;
        }
      } else if (isWeekday && leaveCoveredDates.has(dateKey)) {
        // Day is covered by approved leave — reverse any absence deduction
        if (prevAbsenceDeducted > 0) {
          totalAbsenceDeductDiff -= prevAbsenceDeducted;
          runningUsedDelta -= prevAbsenceDeducted;
        }
        newAbsenceDeducted = 0;
      }

      await tx.timesheetEntry.upsert({
        where: { employeeId_date: { employeeId, date: d } },
        update: { hours: entry.hours, otCredited: newOt, otAbsenceDeducted: newAbsenceDeducted },
        create: { employeeId, date: d, hours: entry.hours, otCredited: newOt, otAbsenceDeducted: newAbsenceDeducted },
      });

      // Keep OtWorkLog in sync for weekend/PH days
      if (isOtDay) {
        await tx.otWorkLog.deleteMany({ where: { employeeId, date: d } });
        if (newOt > 0) {
          const type = holidayDates.has(dateKey) ? "PUBLIC_HOLIDAY" : "WEEKEND";
          const phName = holidays.find((h) => fmtKey(h.date) === dateKey)?.name ?? null;
          await tx.otWorkLog.create({
            data: {
              employeeId,
              date: d,
              type,
              note: phName,
              daysEarned: newOt,
              recordedBy: session.user.name ?? "Employee",
            },
          });
        }
      }
    }

    if (alOtType) {
      // Recalculate earned from OtWorkLog (source of truth) — self-heals any past increments gone wrong
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd   = new Date(Date.UTC(year + 1, 0, 1));
      const allLogs = await tx.otWorkLog.findMany({
        where: { employeeId, date: { gte: yearStart, lt: yearEnd } },
        select: { daysEarned: true },
      });
      const recalcEarned = allLogs.reduce((sum, l) => sum + Number(l.daysEarned), 0);

      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year } },
        update: {
          earned: recalcEarned,
          ...(totalAbsenceDeductDiff !== 0 ? { used: { increment: totalAbsenceDeductDiff } } : {}),
        },
        create: {
          employeeId,
          leaveTypeId: alOtType.id,
          year,
          entitlement: 0,
          earned: recalcEarned,
          used: Math.max(0, totalAbsenceDeductDiff),
        },
      });
    }
  });

  return NextResponse.json({ ok: true, otEarned: totalOtDiff, absenceDeducted: totalAbsenceDeductDiff });
}
