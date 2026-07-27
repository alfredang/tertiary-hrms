import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * Shared attendance (clock in / clock out) helpers.
 *
 * The punch record is keyed on the Singapore *calendar* date so a punch made at
 * 00:30 SGT belongs to that SGT day, not the UTC one. Both the web UI
 * (`/api/attendance/*`) and the native app (`/api/mobile/attendance/*`) write
 * the same `AttendancePunch` rows.
 */

export const ATTENDANCE_TZ = "Asia/Singapore";

/** Today's date at midnight, in Singapore time. */
export function todaySgt(): Date {
  return startOfDay(toZonedTime(new Date(), ATTENDANCE_TZ));
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
