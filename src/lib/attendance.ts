import { prisma } from "@/lib/prisma";

/**
 * Shared attendance (clock in / clock out) helpers.
 *
 * The punch record is keyed on the Singapore *calendar* date so a punch made at
 * 00:30 SGT belongs to that SGT day, not the UTC one. Both the web UI
 * (`/api/attendance/*`) and the native app (`/api/mobile/attendance/*`) write
 * the same `AttendancePunch` rows.
 */

export const ATTENDANCE_TZ = "Asia/Singapore";

/**
 * Today's Singapore calendar date as UTC midnight — the value Prisma stores in
 * the `@db.Date` column. Independent of the server's own timezone.
 */
export function todaySgt(): Date {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: ATTENDANCE_TZ });
  return new Date(`${ymd}T00:00:00Z`);
}

/** Worked hours for a punch pair, rounded to 2dp. Null until clocked out. */
export function punchHours(clockIn: Date | null, clockOut: Date | null): number | null {
  if (!clockIn || !clockOut) return null;
  const ms = clockOut.getTime() - clockIn.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export interface PunchDto {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hours: number | null;
}

export function toPunchDto(p: {
  id: string;
  date: Date;
  clockIn: Date | null;
  clockOut: Date | null;
}): PunchDto {
  return {
    id: p.id,
    date: p.date.toISOString().slice(0, 10),
    clockIn: p.clockIn ? p.clockIn.toISOString() : null,
    clockOut: p.clockOut ? p.clockOut.toISOString() : null,
    hours: punchHours(p.clockIn, p.clockOut),
  };
}

/** Clock in for today. Throws a message string if already clocked in. */
export async function clockIn(employeeId: string) {
  const date = todaySgt();
  const existing = await prisma.attendancePunch.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
  if (existing?.clockIn) throw new Error("Already clocked in today");

  return prisma.attendancePunch.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, clockIn: new Date() },
    update: { clockIn: new Date() },
  });
}

/** Clock out for today. Throws a message string if not clocked in / already out. */
export async function clockOut(employeeId: string) {
  const date = todaySgt();
  const existing = await prisma.attendancePunch.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
  if (!existing?.clockIn) throw new Error("Not clocked in yet today");
  if (existing.clockOut) throw new Error("Already clocked out today");

  return prisma.attendancePunch.update({
    where: { id: existing.id },
    data: { clockOut: new Date() },
  });
}

// ── History + admin summary ─────────────────────────────────────────────────
// Both the web UI (`/api/attendance/{history,summary}`) and the native apps
// (`/api/mobile/attendance/{history,summary}`) serve these exact payloads.

/** `YYYY-MM` for the current Singapore month. */
export function currentMonthSgt(): string {
  return todaySgt().toISOString().slice(0, 7);
}

/**
 * Parse a `YYYY-MM` string into a half-open UTC date range [from, to) matching
 * how `AttendancePunch.date` (@db.Date) is stored. Falls back to the current
 * SGT month for missing or malformed input.
 */
export function monthRange(month: string | null | undefined): { month: string; from: Date; to: Date } {
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : currentMonthSgt();
  const [y, mo] = m.split("-").map(Number);
  return { month: m, from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 1)) };
}

/** Sum of completed-punch hours, rounded to 2dp. */
export function totalHoursOf(punches: { clockIn: Date | null; clockOut: Date | null }[]): number {
  const total = punches.reduce((sum, p) => sum + (punchHours(p.clockIn, p.clockOut) ?? 0), 0);
  return Math.round(total * 100) / 100;
}

export interface AttendanceHistoryDto {
  month: string;
  employee: { id: string; name: string; employeeCode: string };
  days: PunchDto[];
  totalHours: number;
  daysWorked: number;
}

/** One employee's punches for a month, newest first. Null if the employee doesn't exist. */
export async function getAttendanceHistory(
  employeeId: string,
  month: string | null | undefined,
): Promise<AttendanceHistoryDto | null> {
  const range = monthRange(month);
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, employeeId: true },
  });
  if (!employee) return null;

  const punches = await prisma.attendancePunch.findMany({
    where: { employeeId, date: { gte: range.from, lt: range.to } },
    orderBy: { date: "desc" },
  });

  return {
    month: range.month,
    employee: { id: employee.id, name: employee.name, employeeCode: employee.employeeId },
    days: punches.map(toPunchDto),
    totalHours: totalHoursOf(punches),
    daysWorked: punches.filter((p) => p.clockIn).length,
  };
}

export interface AttendanceSummaryRow {
  id: string;
  name: string;
  employeeCode: string;
  isIntern: boolean;
  daysWorked: number;
  totalHours: number;
  lastPunchDate: string | null;
  /** True when today's punch is clocked in but not yet out. */
  clockedInNow: boolean;
}

export interface AttendanceSummaryDto {
  month: string;
  employees: AttendanceSummaryRow[];
  totalHours: number;
}

/**
 * Admin roll-up for a month: every active intern (even with zero punches, so
 * no-shows are visible) plus anyone else who punched in that month.
 */
export async function getAttendanceSummary(month: string | null | undefined): Promise<AttendanceSummaryDto> {
  const range = monthRange(month);
  const today = todaySgt();

  const [punches, interns, openToday] = await Promise.all([
    prisma.attendancePunch.findMany({
      where: { date: { gte: range.from, lt: range.to } },
      select: { employeeId: true, date: true, clockIn: true, clockOut: true },
    }),
    prisma.employee.findMany({
      // employmentType, not roles: admins hold the INTERN role just to switch views.
      where: { status: "ACTIVE", employmentType: "INTERN" },
      select: { id: true },
    }),
    prisma.attendancePunch.findMany({
      where: { date: today, clockIn: { not: null }, clockOut: null },
      select: { employeeId: true },
    }),
  ]);

  const internIds = new Set(interns.map((e) => e.id));
  const openIds = new Set(openToday.map((p) => p.employeeId));
  const ids = Array.from(new Set([...Array.from(internIds), ...punches.map((p) => p.employeeId)]));

  const employees = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, employeeId: true },
  });

  const byEmployee = new Map<string, typeof punches>();
  for (const p of punches) {
    const list = byEmployee.get(p.employeeId) ?? [];
    list.push(p);
    byEmployee.set(p.employeeId, list);
  }

  const rows: AttendanceSummaryRow[] = employees.map((e) => {
    const own = byEmployee.get(e.id) ?? [];
    const last = own.reduce<Date | null>((max, p) => (!max || p.date > max ? p.date : max), null);
    return {
      id: e.id,
      name: e.name,
      employeeCode: e.employeeId,
      isIntern: internIds.has(e.id),
      daysWorked: own.filter((p) => p.clockIn).length,
      totalHours: totalHoursOf(own),
      lastPunchDate: last ? last.toISOString().slice(0, 10) : null,
      clockedInNow: openIds.has(e.id),
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));

  return { month: range.month, employees: rows, totalHours: totalHoursOf(punches) };
}
