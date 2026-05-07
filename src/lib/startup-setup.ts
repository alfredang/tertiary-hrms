import { prisma } from "@/lib/prisma";
import { SG_PUBLIC_HOLIDAYS } from "@/lib/sg-public-holidays";

// Runs on every server start via instrumentation.ts.
// All operations are upserts — safe to run multiple times.
export async function runStartupSetup(): Promise<void> {
  try {
    await ensureLeaveTypes();
    await ensurePublicHolidays();
    console.log("[Startup] Setup complete");
  } catch (err: any) {
    console.error("[Startup] Setup failed:", err?.message ?? err);
  }
}

async function ensureLeaveTypes(): Promise<void> {
  await prisma.leaveType.upsert({
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
}

async function ensurePublicHolidays(): Promise<void> {
  const currentYear = new Date().getFullYear();

  for (const year of [currentYear, currentYear + 1]) {
    const holidays = SG_PUBLIC_HOLIDAYS[year] ?? [];

    for (const h of holidays) {
      const holidayDate = new Date(h.date);

      await prisma.publicHoliday.upsert({
        where: { date_countryCode: { date: holidayDate, countryCode: "SG" } },
        update: { name: h.name },
        create: { date: holidayDate, name: h.name, countryCode: "SG", year },
      });

      const existing = await prisma.calendarEvent.findFirst({
        where: { type: "HOLIDAY", startDate: holidayDate, title: h.name },
      });

      if (!existing) {
        await prisma.calendarEvent.create({
          data: {
            title: h.name,
            description: "Singapore Public Holiday",
            startDate: holidayDate,
            endDate: holidayDate,
            allDay: true,
            type: "HOLIDAY",
            color: "#ef4444",
            createdById: null,
          },
        });
      }
    }
  }
}
