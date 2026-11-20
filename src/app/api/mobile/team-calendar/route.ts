import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";
import { isInternRoles } from "@/lib/leave-policy";
import {
  CALENDAR_CATEGORIES, birthdayEvents, categoryEmoji, holidayTitle, leaveCategory,
} from "@/lib/calendar-categories";
import { isOffDay } from "@/lib/time-off";

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
 *
 * Since 20 Nov 2026 (additive; older app builds ignore the new fields), matching the web calendar:
 * - `entries[].category`: ANNUAL_LEAVE / MEDICAL_LEAVE / NO_PAY_LEAVE / OTHER_LEAVE, only where the
 *   type is shown (own leave, approvers), else null. `categories` is the colour + emoji legend.
 * - `timeOff`: approved time off and intern Off Days — approvers: everyone; others: their own.
 * - `birthdays` (approvers): day and month only, never the age.
 * - `people[].workdays` (approvers) and `ownWorkdays`, so off days can be shaded.
 * - Holiday titles carry an emoji ("🎄 Christmas Day").
 */
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  // A month of slack either side so leave spanning a year boundary still shows.
  const from = new Date(Date.UTC(year - 1, 11, 1));
  const to = new Date(Date.UTC(year + 1, 1, 1));

  const [leave, holidays, publicHolidays, roster] = await Promise.all([
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
          select: { id: true, name: true, department: { select: { name: true } }, user: { select: { roles: true } } },
        },
        leaveType: { select: { name: true, code: true, paid: true } },
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
    // Approvers filter the calendar by person: every active staff member and intern, with or
    // without leave, and nobody who has left (same list as the web calendar).
    ctx.isAdmin
      ? prisma.employee.findMany({
          where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
          select: { id: true, name: true, workdays: true, dateOfBirth: true, user: { select: { roles: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(null),
  ]);

  // Approved time off and intern Off Days: approvers see everyone's, others only their own.
  const [timeOffRows, self] = await Promise.all([
    ctx.isAdmin || ctx.employeeId
      ? prisma.timeOffRequest.findMany({
          where: {
            status: "APPROVED",
            date: { lt: to, gte: from },
            ...(ctx.isAdmin ? {} : { employeeId: ctx.employeeId }),
          },
          select: {
            id: true, date: true, startTime: true, endTime: true, hours: true, reason: true, employeeId: true,
            employee: { select: { name: true, user: { select: { roles: true } } } },
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    ctx.employeeId
      ? prisma.employee.findUnique({ where: { id: ctx.employeeId }, select: { workdays: true } })
      : Promise.resolve(null),
  ]);

  const dayKey = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
  const eventDays = new Set(holidays.map((h) => dayKey(h.startDate)));
  const allHolidays = [
    ...holidays.map((h) => ({ id: h.id, title: holidayTitle(h.title), startDate: iso(h.startDate), endDate: iso(h.endDate) })),
    ...publicHolidays
      .filter((ph) => !eventDays.has(dayKey(ph.date)))
      .map((ph) => ({ id: ph.id, title: holidayTitle(ph.name), startDate: iso(ph.date), endDate: iso(ph.date) })),
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
      category: showType ? leaveCategory(l.leaveType) : null,
      isSelf,
      // Approvers can filter the calendar by staff or interns (same control as the web calendar).
      group: ctx.isAdmin ? (isInternRoles(l.employee?.user?.roles) ? "intern" : "staff") : null,
    };
  });

  const timeOff = timeOffRows.map((t) => ({
    id: t.id,
    employeeId: t.employeeId,
    employeeName: t.employee?.name ?? "Employee",
    date: iso(t.date),
    startTime: t.startTime,
    endTime: t.endTime,
    hours: Number(t.hours),
    offDay: isOffDay(t.reason),
    isSelf: !!ctx.employeeId && t.employeeId === ctx.employeeId,
    group: ctx.isAdmin ? (isInternRoles(t.employee?.user?.roles) ? "intern" : "staff") : null,
  }));

  // Approvers: everyone's birthday in the year shown (and either side, for the year boundary).
  const birthdays = roster
    ? birthdayEvents(roster, [year - 1, year, year + 1]).map((b) => ({
        id: b.id,
        employeeId: b.personId,
        name: b.personName,
        date: b.start.toISOString(),
      }))
    : null;

  return NextResponse.json({
    year,
    canSeeTypes: ctx.isAdmin,
    entries,
    people: roster
      ? roster.map((e) => ({ id: e.id, name: e.name, intern: isInternRoles(e.user?.roles), workdays: e.workdays }))
      : null,
    holidays: allHolidays,
    timeOff,
    birthdays,
    ownWorkdays: self?.workdays ?? null,
    categories: CALENDAR_CATEGORIES.map((c) => ({ ...c, emoji: categoryEmoji(c.key) })),
  });
}
