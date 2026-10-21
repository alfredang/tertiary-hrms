import { prisma } from "@/lib/prisma";
import { num } from "@/lib/mobile-api";
import { prorateLeave } from "@/lib/utils";
import { getSgHolidaysForYear } from "@/lib/sg-public-holidays";
import { getCompanyBranding } from "@/lib/company-settings";
import { timeOffReasonLabel } from "@/lib/time-off";
import { leaveDaysInMonth, round2, type ReportMonth, type SummaryEmployeeRow } from "@/lib/leave-summary";

/**
 * Monthly leave + MC summary of every active staff member and intern. Shared by
 * the AI-agent endpoint (/api/agent/leave-summary, bearer key) and the admin
 * mobile endpoint (/api/mobile/leave-summary, session).
 */
export async function buildLeaveSummary(month: ReportMonth) {
  // Everyone currently active, plus anyone who left during the month (e.g. an
  // intern auto-deactivated on the 1st before this report runs). Excludes
  // people who had not started by month end.
  const employees = await prisma.employee.findMany({
    where: {
      AND: [
        {
          OR: [
            { status: { in: ["ACTIVE", "ON_LEAVE"] } },
            { endDate: { gte: month.start, lte: month.end } },
          ],
        },
        { OR: [{ startDate: null }, { startDate: { lte: month.end } }] },
      ],
    },
    select: {
      id: true,
      employeeId: true,
      name: true,
      email: true,
      position: true,
      employmentType: true,
      status: true,
      startDate: true,
      endDate: true,
      monthlyLeaveRate: true,
      department: { select: { name: true } },
      user: { select: { roles: true } },
    },
    orderBy: { name: "asc" },
  });
  const ids = employees.map((e) => e.id);

  const [leaveTypes, leaveRequests, timeOffRequests, balances, dbHolidays, branding] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { name: "asc" } }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { lte: month.end },
        endDate: { gte: month.start },
      },
      include: { leaveType: { select: { code: true, name: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.timeOffRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: { in: ["APPROVED", "PENDING"] },
        date: { gte: month.start, lte: month.end },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId: { in: ids }, year: month.year },
      include: { leaveType: { select: { code: true, name: true, defaultDays: true } } },
    }),
    prisma.publicHoliday.findMany({ where: { year: month.year, countryCode: "SG" } }),
    getCompanyBranding(),
  ]);

  const holidays = new Set([
    ...getSgHolidaysForYear(month.year),
    ...dbHolidays.map((h) => h.date.toISOString().slice(0, 10)),
  ]);
  const isCurrentYear = month.year === new Date().getFullYear();

  const typeTotals = new Map(
    leaveTypes.map((t) => [t.code, { code: t.code, name: t.name, approvedDays: 0, pendingDays: 0, employees: new Set<string>() }]),
  );
  let timeOffApproved = 0;
  let timeOffPending = 0;

  const rows = employees.map((e) => {
    const category: "STAFF" | "INTERN" =
      e.employmentType === "INTERN" || e.user.roles.includes("INTERN") ? "INTERN" : "STAFF";

    const leaveTaken: Record<string, { approved: number; pending: number }> = {};
    const requests = leaveRequests
      .filter((r) => r.employeeId === e.id)
      .map((r) => {
        const daysInMonth = leaveDaysInMonth(
          { startDate: r.startDate, endDate: r.endDate, days: num(r.days), halfDayPosition: r.halfDayPosition },
          month,
          holidays,
        );
        const code = r.leaveType.code;
        const bucket = (leaveTaken[code] ??= { approved: 0, pending: 0 });
        const total = typeTotals.get(code);
        if (r.status === "APPROVED") {
          bucket.approved += daysInMonth;
          if (total) {
            total.approvedDays += daysInMonth;
            total.employees.add(e.id);
          }
        } else {
          bucket.pending += daysInMonth;
          if (total) total.pendingDays += daysInMonth;
        }
        return {
          leaveType: code,
          leaveTypeName: r.leaveType.name,
          status: r.status,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate.toISOString().slice(0, 10),
          totalDays: num(r.days),
          daysInMonth: round2(daysInMonth),
          dayType: r.dayType,
          halfDayPosition: r.halfDayPosition,
          hasDocument: Boolean(r.documentUrl || r.driveWebViewLink),
        };
      });
    for (const v of Object.values(leaveTaken)) {
      v.approved = round2(v.approved);
      v.pending = round2(v.pending);
    }

    const empTimeOff = timeOffRequests.filter((t) => t.employeeId === e.id);
    let timeOff: (SummaryEmployeeRow["timeOff"] & { requests: unknown[] }) | null = null;
    if (empTimeOff.length > 0) {
      let approvedHours = 0;
      let pendingHours = 0;
      for (const t of empTimeOff) {
        if (t.status === "APPROVED") approvedHours += num(t.hours);
        else pendingHours += num(t.hours);
      }
      timeOffApproved += approvedHours;
      timeOffPending += pendingHours;
      timeOff = {
        approvedHours: round2(approvedHours),
        pendingHours: round2(pendingHours),
        requests: empTimeOff.map((t) => ({
          date: t.date.toISOString().slice(0, 10),
          startTime: t.startTime,
          endTime: t.endTime,
          hours: num(t.hours),
          reason: timeOffReasonLabel(t.reason),
          status: t.status,
        })),
      };
    }

    // Year balances. Mirrors /api/mobile/leave: AL is prorated to today for the
    // current year; OT-earned AL uses earned instead of entitlement.
    const balanceRows = balances
      .filter((b) => b.employeeId === e.id)
      .map((b) => {
        const entitlement = num(b.entitlement);
        const carriedOver = num(b.carriedOver);
        const used = num(b.used);
        const pending = num(b.pending);
        let available: number;
        if (b.leaveType.code === "AL_OT") {
          available = num(b.earned) - used - num(b.autoDeducted) - pending;
        } else if (b.leaveType.code === "AL" && isCurrentYear) {
          const proRated = prorateLeave(
            entitlement || b.leaveType.defaultDays,
            e.startDate ?? undefined,
            e.monthlyLeaveRate != null ? num(e.monthlyLeaveRate) : null,
            true,
          );
          available = proRated + carriedOver - used - pending;
        } else {
          available = entitlement + carriedOver - used - pending;
        }
        return {
          code: b.leaveType.code,
          name: b.leaveType.name,
          entitlement,
          carriedOver,
          usedYtd: used,
          pending,
          available: round2(available),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    return {
      employeeId: e.employeeId,
      name: e.name,
      email: e.email,
      category,
      employmentType: e.employmentType,
      status: e.status,
      position: e.position,
      department: e.department?.name ?? null,
      startDate: e.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: e.endDate?.toISOString().slice(0, 10) ?? null,
      mcDays: leaveTaken.MC?.approved ?? 0,
      leaveTaken,
      requests,
      timeOff,
      balances: balanceRows,
    };
  });

  const byLeaveType = Array.from(typeTotals.values()).map((t) => ({
    code: t.code,
    name: t.name,
    approvedDays: round2(t.approvedDays),
    pendingDays: round2(t.pendingDays),
    employeesOnLeave: t.employees.size,
  }));
  const mcTotal = byLeaveType.find((t) => t.code === "MC");
  const interns = rows.filter((r) => r.category === "INTERN").length;

  const summary = {
    company: branding.name,
    month: month.key,
    period: { start: month.start.toISOString().slice(0, 10), end: month.end.toISOString().slice(0, 10) },
    generatedAt: new Date().toISOString(),
    balancesYear: month.year,
    totals: {
      headcount: { staff: rows.length - interns, interns, total: rows.length },
      employeesWithLeave: rows.filter((r) => r.requests.some((q) => q.status === "APPROVED")).length,
      byLeaveType,
      mc: {
        approvedDays: mcTotal?.approvedDays ?? 0,
        pendingDays: mcTotal?.pendingDays ?? 0,
        employeesOnMc: mcTotal?.employeesOnLeave ?? 0,
      },
      timeOff: { approvedHours: round2(timeOffApproved), pendingHours: round2(timeOffPending) },
    },
    employees: rows,
  };

  return summary;
}

export type LeaveSummary = Awaited<ReturnType<typeof buildLeaveSummary>>;
