import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SG_PUBLIC_HOLIDAYS } from "@/lib/sg-public-holidays";

// POST /api/admin/setup-leave-types
// One-time setup: creates AL_OT leave type + seeds SG public holidays
// into both PublicHoliday table and CalendarEvent table.
// Safe to call multiple times (upsert operations).
export async function POST() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "HR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Create AL_OT leave type
  const alOtType = await prisma.leaveType.upsert({
    where: { code: "AL_OT" },
    update: {},
    create: {
      name: "Accumulated Leave (OT)",
      code: "AL_OT",
      defaultDays: 0,
      description: "Overtime/weekend work accumulated leave",
      carryOver: true,
      paid: true,
    },
  });

  // 2. Seed SG public holidays for current and next year
  const currentYear = new Date().getFullYear();
  let holidaysSeeded = 0;
  let calendarEventsSeeded = 0;

  for (const year of [currentYear, currentYear + 1]) {
    const holidays = SG_PUBLIC_HOLIDAYS[year] ?? [];
    for (const h of holidays) {
      const holidayDate = new Date(h.date);

      // Upsert into PublicHoliday table (for working-day calculation)
      await prisma.publicHoliday.upsert({
        where: { date_countryCode: { date: holidayDate, countryCode: "SG" } },
        update: { name: h.name },
        create: { date: holidayDate, name: h.name, countryCode: "SG", year },
      });
      holidaysSeeded++;

      // Upsert into CalendarEvent table (for calendar view)
      // Use the date string as a deterministic ID suffix to avoid duplicates
      const existingEvent = await prisma.calendarEvent.findFirst({
        where: {
          type: "HOLIDAY",
          startDate: holidayDate,
          title: h.name,
        },
      });

      if (!existingEvent) {
        await prisma.calendarEvent.create({
          data: {
            title: h.name,
            description: `Singapore Public Holiday`,
            startDate: holidayDate,
            endDate: holidayDate,
            allDay: true,
            type: "HOLIDAY",
            color: "#ef4444",
            createdById: null,
          },
        });
        calendarEventsSeeded++;
      }
    }
  }

  return NextResponse.json({ alOtType, holidaysSeeded, calendarEventsSeeded });
}
