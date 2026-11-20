import { prisma } from "@/lib/prisma";
import { isInternRoles } from "@/lib/leave-policy";
import { CalendarView } from "@/components/calendar/calendar-view";
import { AddEventButton } from "@/components/calendar/add-event-button";
import { auth } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import type { Role } from "@prisma/client";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { birthdayEvents, calendarCategoryColor, categoryTitle, eventCategory, holidayTitle, leaveCategory, type CalendarCategory } from "@/lib/calendar-categories";
import { isOffDay, timeOffReasonLabel } from "@/lib/time-off";
import { paidBackSuffix } from "@/lib/npl-payback";
import { leaveDetails, timeOffDetails, type CalendarDetail } from "@/lib/calendar-details";
import { attendanceEvents } from "@/lib/calendar-attendance";
import { mustClockIn } from "@/lib/attendance-policy";

export const dynamic = 'force-dynamic';

async function getCalendarEvents(userId: string, employeeId?: string, showAllLeaves = false) {
  // The four sources are independent, so they load together.
  const [ownEvents, holidayEvents, leaveEvents, allPublicHolidays, timeOff] = await Promise.all([
    // 1. Personal events created by this user (meetings, training, company events)
    prisma.calendarEvent.findMany({
      where: {
        createdById: userId,
        type: { in: ["MEETING", "TRAINING", "COMPANY_EVENT"] },
      },
      orderBy: { startDate: "asc" },
    }),
    // 2. Global holiday events — visible to everyone regardless of who created them
    prisma.calendarEvent.findMany({
      where: { type: "HOLIDAY" },
      orderBy: { startDate: "asc" },
    }),
    // 3. Leave events — admin view: all employees; staff view: own approved leave only
    (async () => {
      if (showAllLeaves) {
        return prisma.calendarEvent.findMany({
          where: { type: "LEAVE", leaveRequestId: { not: null } },
          orderBy: { startDate: "asc" },
        });
      }
      if (!employeeId) return [];
      const userLeaveRequests = await prisma.leaveRequest.findMany({
        where: { employeeId, status: "APPROVED" },
        select: { id: true },
      });
      if (userLeaveRequests.length === 0) return [];
      return prisma.calendarEvent.findMany({
        where: { type: "LEAVE", leaveRequestId: { in: userLeaveRequests.map((lr) => lr.id) } },
        orderBy: { startDate: "asc" },
      });
    })(),
    prisma.publicHoliday.findMany({ where: { countryCode: "SG" }, orderBy: { date: "asc" } }),
    // 4. Approved time off (hourly, and intern off days) — admin view: everyone; staff view: own only
    showAllLeaves || employeeId
      ? prisma.timeOffRequest.findMany({
          where: { status: "APPROVED", ...(showAllLeaves ? {} : { employeeId }) },
          select: {
            id: true, date: true, startTime: true, endTime: true, hours: true, reason: true, reasonDetail: true,
            employee: { select: { id: true, name: true } },
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Each leave's type decides its colour. Admin view also attaches the person, so the calendar
  // can filter by individual.
  const leaveInfo = new Map<string, { category: CalendarCategory; days: number; titleSuffix: string; details: CalendarDetail[]; person?: { id: string; name: string } }>();
  const leaveRequestIds = leaveEvents.map((e) => e.leaveRequestId).filter((id): id is string => !!id);
  if (leaveRequestIds.length) {
    const requests = await prisma.leaveRequest.findMany({
      where: { id: { in: leaveRequestIds } },
      select: {
        id: true, days: true, startDate: true, endDate: true, reason: true, dayType: true, halfDayPosition: true,
        documentUrl: true, driveWebViewLink: true,
        leaveType: { select: { code: true, paid: true, name: true } }, employee: { select: { id: true, name: true } },
      },
    });
    // No Pay Leave paid back by working an off day (approved payback): marked on the leave itself.
    const paybacks = await prisma.nplPayback
      .findMany({
        where: { leaveRequestId: { in: leaveRequestIds }, status: "APPROVED" },
        select: { leaveRequestId: true, nplDate: true, workDate: true, days: true },
        orderBy: { nplDate: "asc" },
      })
      .catch(() => []);
    for (const r of requests) {
      const category = leaveCategory(r.leaveType);
      const paid = paybacks.filter((p) => p.leaveRequestId === r.id).map((p) => ({ nplDate: p.nplDate, workDate: p.workDate, days: Number(p.days) }));
      const paidBack = Math.min(Number(r.days), paid.reduce((s, p) => s + p.days, 0));
      leaveInfo.set(r.id, {
        category,
        // Days still counted as leave: a paid-back No Pay Leave day is not counted in the month totals.
        days: Number(r.days) - paidBack,
        titleSuffix: paidBackSuffix(paidBack, Number(r.days)),
        // Shown when hovering the event: type, dates, days and the reason given (e.g. for an MC).
        details: leaveDetails({
          leaveTypeName: r.leaveType.name, startDate: r.startDate, endDate: r.endDate, days: Number(r.days),
          dayType: r.dayType, halfDayPosition: r.halfDayPosition, reason: r.reason,
          hasDocument: !!(r.documentUrl || r.driveWebViewLink), medical: category === "MEDICAL_LEAVE",
          paybacks: paid,
        }),
        person: showAllLeaves ? r.employee ?? undefined : undefined,
      });
    }
  }

  // Deduplicate across all sources
  const eventMap = new Map<string, (typeof ownEvents)[0]>();
  for (const event of [...holidayEvents, ...ownEvents, ...leaveEvents]) {
    eventMap.set(event.id, event);
  }

  // 3. Every Singapore public holiday (seeded each year at startup), not only the ones an admin
  //    added as calendar events (Alfred, 11 Nov 2026). Skipped where a holiday event already exists.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const holidayDays = new Set(holidayEvents.map((e) => dayKey(e.startDate)));
  const publicHolidays = allPublicHolidays.filter((ph) => !holidayDays.has(dayKey(ph.date)));

  return [
    ...Array.from(eventMap.values()).map((event) => {
      const leave = event.leaveRequestId ? leaveInfo.get(event.leaveRequestId) : undefined;
      const category: CalendarCategory = event.type === "LEAVE" ? leave?.category ?? "ANNUAL_LEAVE" : eventCategory(event.type);
      return {
        id: event.id,
        title: event.type === "HOLIDAY" ? holidayTitle(event.title) : categoryTitle(category, event.title) + (leave?.titleSuffix ?? ""),
        start: event.startDate,
        end: event.endDate,
        allDay: event.allDay,
        type: event.type,
        category,
        // Leave always takes its category colour; other events keep a colour chosen on the event.
        color: event.type === "LEAVE" ? calendarCategoryColor(category) : event.color || calendarCategoryColor(category),
        description: event.description,
        details: leave?.details,
        personId: leave?.person?.id,
        personName: leave?.person?.name,
        // Days charged for the leave, for the person's month totals.
        days: leave?.days,
        hours: undefined as number | undefined,
      };
    }),
    ...timeOff.map((t) => {
      const offDay = isOffDay(t.reason);
      const what = offDay ? "Off Day" : `Time Off ${t.startTime}–${t.endTime}`;
      return {
        id: `to-${t.id}`,
        title: categoryTitle("TIME_OFF", showAllLeaves ? `${t.employee.name} - ${what}` : what),
        // @db.Date is UTC midnight; anchor at SGT noon so the browser places it on the right day.
        start: new Date(`${dayKey(t.date)}T12:00:00+08:00`),
        end: new Date(`${dayKey(t.date)}T12:00:00+08:00`),
        allDay: offDay,
        type: "TIME_OFF",
        category: "TIME_OFF" as CalendarCategory,
        color: calendarCategoryColor("TIME_OFF"),
        description: offDay
          ? "Full day off"
          : `${Number(t.hours)} h · ${timeOffReasonLabel(t.reason)}${t.reasonDetail ? ` — ${t.reasonDetail}` : ""}`,
        details: timeOffDetails({
          offDay, startTime: t.startTime, endTime: t.endTime, hours: Number(t.hours),
          reasonLabel: timeOffReasonLabel(t.reason), reasonDetail: t.reasonDetail,
        }) as CalendarDetail[] | undefined,
        personId: showAllLeaves ? t.employee.id : undefined,
        personName: showAllLeaves ? t.employee.name : undefined,
        days: undefined,
        hours: Number(t.hours),
      };
    }),
    ...publicHolidays.map((ph) => ({
      id: `ph-${ph.id}`,
      title: holidayTitle(ph.name),
      // @db.Date is UTC midnight; anchor at SGT noon so the browser places it on the right day.
      start: new Date(`${dayKey(ph.date)}T12:00:00+08:00`),
      end: new Date(`${dayKey(ph.date)}T12:00:00+08:00`),
      allDay: true,
      type: "HOLIDAY",
      category: "HOLIDAY" as CalendarCategory,
      color: calendarCategoryColor("HOLIDAY"),
      description: "Public holiday",
      details: undefined,
      personId: undefined,
      personName: undefined,
      days: undefined,
      hours: undefined,
    })),
  ];
}

/**
 * Clock-in / clock-out days for the calendar (Alfred, 20 Nov 2026), only for people who must clock in
 * (interns and accountants, `mustClockIn()`). Staff / intern view: the viewer's own days. Admin view:
 * every active intern's and accountant's, shown only when that person is picked in the filter (never on
 * the "Everyone" calendar). Last year on.
 */
async function getAttendancePunches(showAll: boolean, employeeId?: string) {
  const since = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1));
  const select = {
    id: true, date: true, clockIn: true, clockOut: true, pausedAt: true, breakSeconds: true,
    employee: { select: { id: true, name: true } },
  } as const;
  if (showAll) {
    const people = await prisma.employee.findMany({
      where: { status: { in: ["ACTIVE", "ON_LEAVE"] }, user: { OR: [{ roles: { equals: ["INTERN"] } }, { roles: { has: "ACCOUNTANT" } }] } },
      select: { id: true, user: { select: { roles: true } } },
    });
    const ids = people.filter((p) => mustClockIn(p.user?.roles)).map((p) => p.id);
    if (!ids.length) return [];
    return prisma.attendancePunch.findMany({
      where: { employeeId: { in: ids }, date: { gte: since }, clockIn: { not: null } },
      select, orderBy: { date: "asc" },
    });
  }
  if (!employeeId) return [];
  const me = await prisma.employee.findUnique({ where: { id: employeeId }, select: { user: { select: { roles: true } } } });
  if (!mustClockIn(me?.user?.roles)) return [];
  return prisma.attendancePunch.findMany({
    where: { employeeId, date: { gte: since }, clockIn: { not: null } },
    select, orderBy: { date: "asc" },
  });
}

export default async function CalendarPage() {
  const [session, viewMode] = await Promise.all([auth(), getViewMode()]);

  let role: Role = "STAFF";
  let currentUserId: string | undefined;
  let currentEmployeeId: string | undefined;

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    currentUserId = adminUser?.id;
    currentEmployeeId = adminUser?.employee?.id;
  } else if (session?.user) {
    role = session.user.role;
    currentUserId = session.user.id;
    currentEmployeeId = session.user.employeeId;
  }

  if (!currentUserId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Calendar</h1>
        <p className="text-sm sm:text-base text-gray-400">Your profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";

  // Admin view: see all employees' leaves; Staff view: see only own leaves
  const showAllLeaves = viewAs === "admin";
  const [events, activeEmployees, self, punches] = await Promise.all([
    getCalendarEvents(currentUserId, currentEmployeeId, showAllLeaves),
    // The person filter lists every active staff member and intern, with or without leave.
    showAllLeaves
      ? prisma.employee.findMany({
          where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
          select: { id: true, name: true, workdays: true, dateOfBirth: true, user: { select: { roles: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Staff / intern view: the viewer's own workdays, so their off days are shaded.
    !showAllLeaves && currentEmployeeId
      ? prisma.employee.findUnique({ where: { id: currentEmployeeId }, select: { workdays: true } })
      : Promise.resolve(null),
    getAttendancePunches(showAllLeaves, currentEmployeeId),
  ]);
  const attendance = attendanceEvents(punches, showAllLeaves);
  // Admin view: every active staff member's and intern's birthday, last year to two years ahead.
  const thisYear = new Date().getFullYear();
  const birthdays = birthdayEvents(activeEmployees, [thisYear - 1, thisYear, thisYear + 1, thisYear + 2]).map((b) => ({
    ...b, details: undefined, days: undefined, hours: undefined,
  }));
  const people = activeEmployees.map((e) => ({
    id: e.id, name: e.name, intern: isInternRoles(e.user?.roles), workdays: e.workdays, clocksIn: mustClockIn(e.user?.roles),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Calendar</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            Events, holidays, leave & time off
          </p>
        </div>
        <AddEventButton />
      </div>

      <CalendarView events={[...events, ...attendance, ...birthdays]} personFilter={showAllLeaves} people={people} ownWorkdays={self?.workdays} />
    </div>
  );
}
