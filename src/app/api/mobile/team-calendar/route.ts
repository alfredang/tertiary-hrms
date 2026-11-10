import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/team-calendar?year=YYYY — approved leave across the company,
 * so the mobile app can show who is out and when.
 *
 * Privacy: a leave *type* is health-adjacent (medical leave discloses illness),
 * so a regular employee sees only that a colleague is away. Approvers
 * (ADMIN/HR/MANAGER — the roles that already read this on the web) additionally
 * see the type, and everyone always sees full detail of their OWN leave. The
 * masking happens here on the server: the client is never sent what it may not
 * show.
 *
 * Only APPROVED leave is returned — the calendar answers "who will actually be
 * out", and pending requests may still be rejected.
 */
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  // A month of slack either side so leave spanning a year boundary still shows.
  const from = new Date(Date.UTC(year - 1, 11, 1));
  const to = new Date(Date.UTC(year + 1, 1, 1));

  const [leave, holidays, publicHolidays] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lt: to }, endDate: { gte: from } },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        days: true,
        dayType: true,
        employeeId: true,
        employee: {
          select: { id: true, name: true, department: { select: { name: true } } },
        },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { type: "HOLIDAY", startDate: { lt: to, gte: from } },
      orderBy: { startDate: "asc" },
    }),
    // Every Singapore public holiday (seeded each year by startup-setup), not only the ones an
    // admin added as calendar events (Alfred, 11 Nov 2026: "show all the public holidays").
    prisma.publicHoliday.findMany({
      where: { countryCode: "SG", date: { lt: to, gte: from } },
      orderBy: { date: "asc" },
    }),
  ]);

  const dayKey = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
  const eventDays = new Set(holidays.map((h) => dayKey(h.startDate)));
  const allHolidays = [
    ...holidays.map((h) => ({ id: h.id, title: h.title, startDate: iso(h.startDate), endDate: iso(h.endDate) })),
    ...publicHolidays
      .filter((ph) => !eventDays.has(dayKey(ph.date)))
      .map((ph) => ({ id: ph.id, title: ph.name, startDate: iso(ph.date), endDate: iso(ph.date) })),
  ].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

  const entries = leave.map((l) => {
    const isSelf = !!ctx.employeeId && l.employeeId === ctx.employeeId;
    const showType = isSelf || ctx.isAdmin;
    return {
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee?.name ?? "Employee",
      department: l.employee?.department?.name ?? null,
      startDate: iso(l.startDate),
      endDate: iso(l.endDate),
      days: Number(l.days),
      halfDay: l.dayType !== "FULL_DAY",
      leaveType: showType ? (l.leaveType?.name ?? "Leave") : null,
      isSelf,
    };
  });

  return NextResponse.json({
    year,
    canSeeTypes: ctx.isAdmin,
    entries,
    holidays: allHolidays,
  });
}
