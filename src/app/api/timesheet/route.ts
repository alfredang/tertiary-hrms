import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      .slice(0, 10)
  );
}

function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

// Non-official days (weekend or PH) are submittable between 11:30 AM – 11:30 PM SGT
function isDaySubmittable(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const unlockUTC = Date.UTC(y, m - 1, d, 3, 30);  // 11:30 AM SGT
  const lockUTC   = Date.UTC(y, m - 1, d, 15, 30); // 11:30 PM SGT
  const now = Date.now();
  return now >= unlockUTC && now < lockUTC;
}

function otForHours(hours: number): number {
  if (hours >= 8) return 1;
  if (hours >= 4) return 0.5;
  return 0;
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

  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    return parseUTC(
      new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + i))
        .toISOString()
        .slice(0, 10)
    );
  });

  const weekEnd = days[6];
  const employeeId = session.user.employeeId;

  const [entries, holidays] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { employeeId, date: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.publicHoliday.findMany({
      where: { date: { gte: weekStart, lte: weekEnd }, countryCode: "SG" },
    }),
  ]);

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
      const isNonWorkDay = isWeekendUTC(d) || !!phName;
      return {
        date: key,
        dayName: DAY_NAMES[d.getUTCDay()],
        isWeekend: isWeekendUTC(d),
        isPublicHoliday: !!phName,
        phName,
        isNonWorkDay,
        hours: entry ? Number(entry.hours) : 0,
        otCredited: entry ? Number(entry.otCredited) : 0,
        status: entry?.status ?? null,
        adminComment: entry?.adminComment ?? null,
        // Only non-work days are submittable and only on the current week
        isSubmittable: !isLocked && isNonWorkDay && isDaySubmittable(key),
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

  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: weekStart, lte: weekEnd }, countryCode: "SG" },
  });
  const holidayDates = new Set(holidays.map((h) => fmtKey(h.date)));

  for (const entry of entries) {
    const dateKey = entry.date.slice(0, 10);
    const d = parseUTC(dateKey);

    const isNonWorkDay = isWeekendUTC(d) || holidayDates.has(dateKey);
    if (!isNonWorkDay) {
      return NextResponse.json({ error: `${dateKey} is a regular workday — only weekend/PH hours can be submitted` }, { status: 400 });
    }

    if (!isDaySubmittable(dateKey)) {
      return NextResponse.json({ error: `${dateKey} is not in the submission window (11:30 AM – 11:30 PM SGT)` }, { status: 400 });
    }

    const phName = holidays.find((h) => fmtKey(h.date) === dateKey)?.name ?? null;
    const type = holidayDates.has(dateKey) ? "PUBLIC_HOLIDAY" : "WEEKEND";

    await prisma.timesheetEntry.upsert({
      where: { employeeId_date: { employeeId, date: d } },
      update: {
        hours: entry.hours,
        otCredited: otForHours(entry.hours),
        status: "PENDING",
        adminComment: null,
      },
      create: {
        employeeId,
        date: d,
        hours: entry.hours,
        otCredited: otForHours(entry.hours),
        status: "PENDING",
      },
    });

    // Remove OtWorkLog on (re)submission — only created on admin approval
    await prisma.otWorkLog.deleteMany({ where: { employeeId, date: d } });
  }

  return NextResponse.json({ ok: true });
}
