import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isWeekend, toLocalDateString } from "@/lib/utils";
import { getSgHolidaysForYear } from "@/lib/sg-public-holidays";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeId = session.user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee record" }, { status: 400 });

  const now = new Date();
  const today = toLocalDateString(now);
  const year = now.getFullYear();

  // Check if already clocked in today (exact date match via unique index)
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: new Date(today) } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already clocked in today" }, { status: 400 });
  }

  // Determine day type
  const holidays = getSgHolidaysForYear(year);
  const dbHolidays = await prisma.publicHoliday.findMany({ where: { year, countryCode: "SG" } });
  const allHolidays = new Set([...holidays, ...dbHolidays.map((h) => h.date.toISOString().slice(0, 10))]);

  let dayType: "WEEKDAY" | "WEEKEND" | "PUBLIC_HOLIDAY" = "WEEKDAY";
  if (allHolidays.has(today)) {
    dayType = "PUBLIC_HOLIDAY";
  } else if (isWeekend(now)) {
    dayType = "WEEKEND";
  }

  try {
    const record = await prisma.attendance.create({
      data: {
        employeeId,
        date: new Date(today),
        clockIn: now,
        dayType,
      },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Already clocked in today" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to clock in" }, { status: 500 });
  }
}
