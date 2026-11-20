// Clock-in / clock-out on the calendar (Alfred, 20 Nov 2026): people who must clock in (interns and
// accountants, `mustClockIn()`) see each day they clocked in as "✅ In 09:02 · Out 18:05" on their own
// calendar. The admin calendar shows the same events for the person picked in the filter.

import { calendarCategoryColor, type CalendarCategory } from "@/lib/calendar-categories";
import { workedMs } from "@/lib/attendance-policy";
import type { CalendarDetail } from "@/lib/calendar-details";

export type CalendarPunch = {
  id: string;
  date: Date;
  clockIn: Date | null;
  clockOut: Date | null;
  pausedAt?: Date | null;
  breakSeconds?: number | null;
  employee?: { id: string; name: string };
};

/** "09:02", Singapore time, 24-hour. */
export function sgtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
}

/** "8h 05m". */
function hm(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** "✅ In 09:02 · Out 18:05", or "✅ In 09:02" while still clocked in. */
export function attendanceTitle(clockIn: Date, clockOut: Date | null): string {
  return `✅ In ${sgtTime(clockIn)}${clockOut ? ` · Out ${sgtTime(clockOut)}` : ""}`;
}

export function attendanceDetails(p: CalendarPunch, now: Date = new Date()): CalendarDetail[] {
  if (!p.clockIn) return [];
  const isToday = p.date.toISOString().slice(0, 10) === new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const breakSec = p.breakSeconds ?? 0;
  return [
    { label: "Clock in", value: sgtTime(p.clockIn) },
    { label: "Clock out", value: p.clockOut ? sgtTime(p.clockOut) : isToday ? "Still clocked in" : "Not clocked out" },
    ...(breakSec > 0 ? [{ label: "Break", value: hm(breakSec * 1000) }] : []),
    ...(p.clockOut ? [{ label: "Worked", value: hm(workedMs(p.clockIn, p.clockOut, p.breakSeconds, p.pausedAt)) }] : []),
  ];
}

/**
 * One calendar event per day with a clock-in. Days without a clock-in are left out. `withName` puts
 * the person in front (admin view): "✅ TAN AH KOW - In 09:02 · Out 18:05".
 */
export function attendanceEvents(punches: CalendarPunch[], withName = false, now: Date = new Date()) {
  return punches.flatMap((p) => {
    if (!p.clockIn) return [];
    const base = attendanceTitle(p.clockIn, p.clockOut);
    return [{
      id: `att-${p.id}`,
      title: withName && p.employee ? `✅ ${p.employee.name} - ${base.slice(2)}` : base,
      // The clock-in instant, so the agenda shows the time and the browser places it on the right day.
      start: p.clockIn,
      end: p.clockOut ?? p.clockIn,
      allDay: false,
      type: "ATTENDANCE",
      category: "ATTENDANCE" as CalendarCategory,
      color: calendarCategoryColor("ATTENDANCE"),
      description: p.clockOut ? `${sgtTime(p.clockIn)} – ${sgtTime(p.clockOut)}` : `Clocked in ${sgtTime(p.clockIn)}`,
      details: attendanceDetails(p, now),
      personId: withName ? p.employee?.id : undefined,
      personName: withName ? p.employee?.name : undefined,
      days: undefined,
      hours: undefined,
    }];
  });
}
