import { prisma } from "@/lib/prisma";
import { prorateLeave } from "@/lib/utils";
import {
  ALLOW_ADVANCE_AL,
  isInternRoles,
  isMedicalLeaveCode,
  mcAnnualEntitlement,
  nplCapToDate,
  NPL_CODE,
} from "@/lib/leave-policy";
import {
  addDays,
  findMissedPunches,
  hoursBetween,
  weekStart,
  ymd,
  type InternRef,
  type MissedPunch,
} from "@/lib/attendance-policy";
import type { InternAttendanceRow, PersonLeaveRow } from "@/lib/hr-compliance";
import { sgtToday } from "@/lib/admin-alerts";
import { annualLeaveAmounts, leaveBalancePeriodWhere } from "@/lib/annual-leave-policy";

/**
 * Data loaders for the admin dashboard and the HR cron jobs. Interns are users
 * whose roles are exactly ["INTERN"] (see src/lib/leave-policy.ts).
 */

export type LeaveCategory = "MC" | "LEAVE" | "NPL";

export function leaveCategory(code: string): LeaveCategory {
  if (isMedicalLeaveCode(code)) return "MC";
  if (code === NPL_CODE) return "NPL";
  return "LEAVE";
}

export interface ActiveIntern extends InternRef {
  name: string;
  employeeCode: string;
  email: string;
  userId: string;
}

export async function getActiveInterns(): Promise<ActiveIntern[]> {
  const rows = await prisma.employee.findMany({
    where: { status: "ACTIVE", user: { roles: { equals: ["INTERN"] } } },
    select: { id: true, name: true, employeeId: true, email: true, userId: true, workdays: true, startDate: true, endDate: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    employeeCode: r.employeeId,
    email: r.email,
    userId: r.userId,
    workdays: r.workdays,
    startDate: r.startDate,
    endDate: r.endDate,
  }));
}

/** `${employeeId}|YYYY-MM-DD` for every pending/approved correction in range (empty if the table is missing). */
async function correctedKeys(employeeIds: string[], from: Date, to: Date): Promise<Set<string>> {
  try {
    const rows = await prisma.attendanceCorrection.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: from, lt: to }, status: { in: ["PENDING", "APPROVED"] } },
      select: { employeeId: true, date: true },
    });
    return new Set(rows.map((r) => `${r.employeeId}|${ymd(r.date)}`));
  } catch {
    return new Set();
  }
}

/** Missed clock-ins/outs for each day in [from, to) (UTC-midnight SGT dates). */
export async function getMissedPunches(interns: InternRef[], from: Date, to: Date): Promise<MissedPunch[]> {
  if (interns.length === 0 || from >= to) return [];
  const ids = interns.map((i) => i.id);
  const [punches, leaves, offDays, holidays, corrected] = await Promise.all([
    prisma.attendancePunch.findMany({
      where: { employeeId: { in: ids }, date: { gte: from, lt: to } },
      select: { employeeId: true, date: true, clockIn: true, clockOut: true },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lt: to }, endDate: { gte: from } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    // Approved Off Days (full-day time off): no clock-in/out is expected.
    prisma.timeOffRequest.findMany({
      where: { employeeId: { in: ids }, status: "APPROVED", reason: "OFF_DAY", date: { gte: from, lt: to } },
      select: { employeeId: true, date: true },
    }),
    prisma.publicHoliday.findMany({ where: { countryCode: "SG", date: { gte: from, lt: to } }, select: { date: true } }),
    correctedKeys(ids, from, to),
  ]);
  const holidaySet = new Set(holidays.map((h) => ymd(h.date)));
  const out: MissedPunch[] = [];
  for (let d = new Date(from); d < to; d = addDays(d, 1)) {
    const key = ymd(d);
    const onLeave = new Set([
      ...leaves.filter((l) => ymd(l.startDate) <= key && ymd(l.endDate) >= key).map((l) => l.employeeId),
      ...offDays.filter((o) => ymd(o.date) === key).map((o) => o.employeeId),
    ]);
    out.push(
      ...findMissedPunches({ date: d, interns, punches, onLeave, isPublicHoliday: holidaySet.has(key), corrected }),
    );
  }
  return out;
}

export interface InternHoursRow extends InternAttendanceRow {
  weekHours: number;
  monthHours: number;
  daysWorkedMonth: number;
  clockedInNow: boolean;
  pendingCorrections: number;
}

/**
 * Per-intern hours this week / month plus missed punches over the last
 * `lookbackDays` days (today excluded — the day isn't over yet).
 */
export async function getInternAttendance(lookbackDays = 14, now: Date = new Date()): Promise<InternHoursRow[]> {
  const interns = await getActiveInterns();
  if (interns.length === 0) return [];
  const today = sgtToday(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const wkStart = weekStart(today);
  const from = new Date(Math.min(monthStart.getTime(), wkStart.getTime(), addDays(today, -lookbackDays).getTime()));
  const ids = interns.map((i) => i.id);

  const [punches, missed, pending] = await Promise.all([
    prisma.attendancePunch.findMany({
      where: { employeeId: { in: ids }, date: { gte: from, lte: today } },
      select: { employeeId: true, date: true, clockIn: true, clockOut: true },
    }),
    getMissedPunches(interns, addDays(today, -lookbackDays), today),
    prisma.attendanceCorrection
      .groupBy({ by: ["employeeId"], where: { employeeId: { in: ids }, status: "PENDING" }, _count: true })
      .catch(() => [] as Array<{ employeeId: string; _count: number }>),
  ]);
  const pendingBy = new Map(pending.map((p) => [p.employeeId, p._count]));
  const tomorrow = addDays(today, 1);

  return interns.map((i) => {
    const own = punches.filter((p) => p.employeeId === i.id);
    const mine = missed.filter((m) => m.employeeId === i.id);
    return {
      id: i.id,
      name: i.name,
      employeeCode: i.employeeCode,
      weekHours: hoursBetween(own, wkStart, tomorrow),
      monthHours: hoursBetween(own, monthStart, tomorrow),
      daysWorkedMonth: own.filter((p) => p.clockIn && p.date >= monthStart).length,
      clockedInNow: own.some((p) => ymd(p.date) === ymd(today) && p.clockIn && !p.clockOut),
      missingClockOuts: mine.filter((m) => m.kind === "NO_CLOCK_OUT").map((m) => m.date),
      missingClockIns: mine.filter((m) => m.kind === "NO_CLOCK_IN").map((m) => m.date),
      pendingCorrections: pendingBy.get(i.id) ?? 0,
    };
  });
}

export interface PersonOverviewRow extends PersonLeaveRow {
  taken: {
    year: Record<LeaveCategory, number>;
    month: Record<LeaveCategory, number>;
  };
  pendingDays: number;
  /** No Pay Leave days that were intern sick leave (reason starts "Sick leave (MC)"). */
  nplSickDays: number;
}

const zero = (): Record<LeaveCategory, number> => ({ MC: 0, LEAVE: 0, NPL: 0 });

/**
 * Leave figures for every active employee this year: taken (approved) by category
 * for the year and month — attributed to the month the leave starts — plus the
 * policy figures (earned AL/MC, NPL cap) the alerts compare against.
 */
export async function getLeaveOverview(now: Date = new Date()): Promise<PersonOverviewRow[]> {
  const year = now.getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const monthStart = new Date(Date.UTC(year, now.getMonth(), 1));
  const monthEnd = new Date(Date.UTC(year, now.getMonth() + 1, 1));

  const [employees, requests, balances, types] = await Promise.all([
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true, startDate: true, endDate: true, monthlyLeaveRate: true, user: { select: { roles: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: yearStart, lt: yearEnd } },
      select: { employeeId: true, status: true, startDate: true, endDate: true, days: true, deficitDays: true, reason: true, leaveType: { select: { code: true } } },
    }),
    prisma.leaveBalance.findMany({ where: leaveBalancePeriodWhere(now), select: { employeeId: true, leaveTypeId: true, entitlement: true,
      carriedOver: true, used: true, pending: true, earned: true, periodStart: true, periodEnd: true } }),
    prisma.leaveType.findMany({ select: { id: true, code: true, defaultDays: true } }),
  ]);

  const typeById = new Map(types.map((t) => [t.id, t]));
  const alType = types.find((t) => t.code === "AL");
  const mcType = types.find((t) => t.code === "MC");

  return employees.map((e) => {
    const isIntern = isInternRoles(e.user?.roles);
    const rate = e.monthlyLeaveRate != null ? Number(e.monthlyLeaveRate) : null;
    const own = requests.filter((r) => r.employeeId === e.id);
    const bal = (code: string) =>
      balances.find((b) => b.employeeId === e.id && typeById.get(b.leaveTypeId)?.code === code);

    const alBal = bal("AL");
    const alYearly = alBal ? Number(alBal.entitlement) : alType?.defaultDays ?? 7;
    const alAmounts = annualLeaveAmounts({ entitlement: alYearly, used: Number(alBal?.used ?? 0), pending: Number(alBal?.pending ?? 0),
      carriedOver: Number(alBal?.carriedOver ?? 0), recordedEarned: Number(alBal?.earned ?? 0), periodStart: alBal?.periodStart, periodEnd: alBal?.periodEnd }, { ...e, monthlyLeaveRate: rate }, now);
    const alEarned = alAmounts.earned;
    const alFull = alAmounts.fullEntitlement;

    const mcBal = bal("MC");
    const mcYearly = mcAnnualEntitlement(mcBal ? Number(mcBal.entitlement) : mcType?.defaultDays ?? 14, isIntern);
    const mcEarned = prorateLeave(mcYearly, e.startDate, null, false, now, e.endDate) + (mcBal ? Number(mcBal.carriedOver) : 0);

    const sum = (pred: (r: (typeof own)[number]) => boolean) => own.filter(pred).reduce((s, r) => s + Number(r.days), 0);
    const yearTaken = zero();
    const monthTaken = zero();
    for (const r of own) {
      if (r.status !== "APPROVED") continue;
      const cat = leaveCategory(r.leaveType.code);
      yearTaken[cat] += Number(r.days);
      if (r.startDate >= monthStart && r.startDate < monthEnd) monthTaken[cat] += Number(r.days);
    }

    return {
      id: e.id,
      name: e.name,
      employeeCode: e.employeeId,
      isIntern,
      al: {
        earned: alEarned,
        full: alFull,
        carried: alBal ? Number(alBal.carriedOver) : 0,
        used: alAmounts.isContract ? Number(alBal!.used) : sum((r) => r.leaveType.code === "AL" && r.status === "APPROVED"),
        pending: alAmounts.isContract ? Number(alBal!.pending) : sum((r) => r.leaveType.code === "AL" && r.status === "PENDING"),
        allowed: ALLOW_ADVANCE_AL ? Math.max(alEarned, alFull) : alEarned,
      },
      mc: {
        earned: mcEarned,
        used: sum((r) => isMedicalLeaveCode(r.leaveType.code) && r.status === "APPROVED"),
        pending: sum((r) => isMedicalLeaveCode(r.leaveType.code) && r.status === "PENDING"),
      },
      npl: {
        cap: nplCapToDate(e.startDate, now, e.endDate),
        used: sum((r) => r.leaveType.code === NPL_CODE && r.status === "APPROVED"),
        pending: sum((r) => r.leaveType.code === NPL_CODE && r.status === "PENDING"),
      },
      mcLeaves: own
        .filter((r) => isMedicalLeaveCode(r.leaveType.code) && r.status === "APPROVED")
        .map((r) => ({ startDate: r.startDate, endDate: r.endDate, days: Number(r.days) })),
      deficitDays: own.filter((r) => r.leaveType.code === "AL").reduce((s, r) => s + Number(r.deficitDays), 0),
      taken: { year: yearTaken, month: monthTaken },
      pendingDays: sum((r) => r.status === "PENDING"),
      nplSickDays: sum((r) => r.leaveType.code === NPL_CODE && r.status === "APPROVED" && (r.reason ?? "").startsWith("Sick leave (MC)")),
    };
  });
}

export interface PendingApprovals {
  leave: number;
  mc: number;
  timeOff: number;
  corrections: number;
  expenses: number;
}

export async function getPendingApprovals(): Promise<PendingApprovals> {
  const medical = await prisma.leaveType.findMany({ where: { code: { in: ["MC", "SL", "MEDICAL"] } }, select: { id: true } });
  const medicalIds = medical.map((m) => m.id);
  const [leave, mc, timeOff, corrections, expenses] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING", leaveTypeId: { notIn: medicalIds } } }),
    prisma.leaveRequest.count({ where: { status: "PENDING", leaveTypeId: { in: medicalIds } } }),
    prisma.timeOffRequest.count({ where: { status: "PENDING" } }),
    prisma.attendanceCorrection.count({ where: { status: "PENDING" } }).catch(() => 0),
    prisma.expenseClaim.count({ where: { status: "PENDING" } }),
  ]);
  return { leave, mc, timeOff, corrections, expenses };
}

// ── Dashboard KPIs ──────────────────────────────────────────────────────────

export interface MonthlyLeavePoint {
  month: string; // "Jan"
  staff: Record<LeaveCategory, number>;
  interns: Record<LeaveCategory, number>;
}

/** Approved leave days per month (by start month) this year, split staff / interns, for the dashboard chart. */
export async function getMonthlyLeaveSeries(now: Date = new Date()): Promise<MonthlyLeavePoint[]> {
  const year = now.getFullYear();
  const rows = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { startDate: true, days: true, leaveType: { select: { code: true } }, employee: { select: { user: { select: { roles: true } } } } },
  });
  const points: MonthlyLeavePoint[] = Array.from({ length: now.getMonth() + 1 }, (_, m) => ({
    month: new Date(Date.UTC(year, m, 1)).toLocaleDateString("en-SG", { month: "short", timeZone: "UTC" }),
    staff: zero(),
    interns: zero(),
  }));
  for (const r of rows) {
    const m = r.startDate.getUTCMonth();
    if (!points[m]) continue;
    const bucket = isInternRoles(r.employee?.user?.roles) ? points[m].interns : points[m].staff;
    bucket[leaveCategory(r.leaveType.code)] += Number(r.days);
  }
  return points;
}

export interface WorkforceSnapshot {
  staff: number;
  interns: number;
  onLeaveToday: { name: string; employeeCode: string; category: LeaveCategory }[];
}

/** Active headcount and who is on approved leave today (SGT). */
export async function getWorkforceSnapshot(): Promise<WorkforceSnapshot> {
  const today = sgtToday();
  const [employees, leaves] = await Promise.all([
    prisma.employee.findMany({ where: { status: "ACTIVE" }, select: { user: { select: { roles: true } } } }),
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      select: { leaveType: { select: { code: true } }, employee: { select: { name: true, employeeId: true } } },
    }),
  ]);
  const interns = employees.filter((e) => isInternRoles(e.user?.roles)).length;
  return {
    staff: employees.length - interns,
    interns,
    onLeaveToday: leaves.map((l) => ({ name: l.employee.name, employeeCode: l.employee.employeeId, category: leaveCategory(l.leaveType.code) })),
  };
}
