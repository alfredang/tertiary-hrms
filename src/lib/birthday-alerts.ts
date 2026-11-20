// Morning notifications for the admins (Alfred, 20 Nov 2026): birthdays, and who is on MC, leave or
// No Pay Leave today. Both are silent pushes (only approval requests make a sound). Birthdays: on the day, each admin gets an
// in-app notification, which is also the phone push, for every active staff member and intern
// whose birthday it is. Day and month only: the age is never shown (same rule as the calendar).
import { prisma } from "@/lib/prisma";
import { notifyApprovers } from "@/lib/admin-alerts";

/** People whose birthday falls on `today` (a Singapore calendar day as YYYY-MM-DD). A 29 Feb birthday is kept on 28 Feb in a non-leap year. */
export function birthdaysOn<T extends { dateOfBirth: Date | null }>(people: T[], today: string): T[] {
  const [year, month, day] = today.split("-").map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return people.filter((p) => {
    if (!p.dateOfBirth) return false;
    // The stored date is read in Singapore time, as on the calendar.
    const sgt = new Date(p.dateOfBirth.getTime() + 8 * 3600 * 1000);
    const m = sgt.getUTCMonth() + 1;
    const d = m === 2 && sgt.getUTCDate() === 29 && !leap ? 28 : sgt.getUTCDate();
    return m === month && d === day;
  });
}

/**
 * Notify the admins of today's birthdays. Safe to run more than once a day: a person already
 * announced today is skipped. Never throws.
 */
export async function sendBirthdayAlerts(now: Date = new Date()): Promise<{ birthdays: number; birthdayNotified: number }> {
  try {
    const today = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const people = await prisma.employee.findMany({
      where: { status: { in: ["ACTIVE", "ON_LEAVE"] }, dateOfBirth: { not: null } },
      select: { name: true, dateOfBirth: true },
      orderBy: { name: "asc" },
    });
    const due = birthdaysOn(people, today);
    let notified = 0;
    for (const p of due) {
      const message = `Today is ${p.name}'s birthday.`;
      const already = await prisma.notification.findFirst({
        where: { type: "BIRTHDAY", message, createdAt: { gte: new Date(`${today}T00:00:00+08:00`) } },
        select: { id: true },
      });
      if (already) continue;
      notified += await notifyApprovers({ title: "🎂 Birthday today", message, type: "BIRTHDAY", link: "/calendar" });
    }
    return { birthdays: due.length, birthdayNotified: notified };
  } catch (err) {
    console.error("[birthday-alerts]", err instanceof Error ? err.message : err);
    return { birthdays: 0, birthdayNotified: 0 };
  }
}

/** "A (Medical Leave), B (Annual Leave)" for the people away, MC first. */
export function awayTodayMessage(rows: { name: string; leaveType: string }[]): string {
  const rank = (t: string) => (/medical|sick/i.test(t) ? 0 : /no pay/i.test(t) ? 2 : 1);
  const list = [...rows]
    .sort((a, b) => rank(a.leaveType) - rank(b.leaveType) || a.name.localeCompare(b.name))
    .map((r) => `${r.name} (${r.leaveType})`);
  return `Away today: ${list.join(", ")}.`;
}

/**
 * One morning notification to the admins listing who is on MC, leave or No Pay Leave today
 * (approved requests only). Nothing is sent on a weekend, a public holiday, or when nobody is
 * away. Safe to run more than once a day. Never throws.
 */
export async function sendAwayTodayAlert(now: Date = new Date()): Promise<{ away: number; awayNotified: number }> {
  try {
    const today = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const day = new Date(`${today}T00:00:00.000Z`);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) return { away: 0, awayNotified: 0 };
    const holiday = await prisma.publicHoliday.findFirst({ where: { date: day, countryCode: "SG" }, select: { id: true } });
    if (holiday) return { away: 0, awayNotified: 0 };

    const leaves = await prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day }, employee: { status: { in: ["ACTIVE", "ON_LEAVE"] } } },
      select: { employee: { select: { name: true } }, leaveType: { select: { name: true } } },
    });
    if (leaves.length === 0) return { away: 0, awayNotified: 0 };
    const already = await prisma.notification.findFirst({
      where: { type: "AWAY_TODAY", createdAt: { gte: new Date(`${today}T00:00:00+08:00`) } },
      select: { id: true },
    });
    if (already) return { away: leaves.length, awayNotified: 0 };
    const awayNotified = await notifyApprovers({
      title: "On MC / leave today",
      message: awayTodayMessage(leaves.map((l) => ({ name: l.employee.name, leaveType: l.leaveType.name }))),
      type: "AWAY_TODAY",
      link: "/calendar",
    });
    return { away: leaves.length, awayNotified };
  } catch (err) {
    console.error("[away-today]", err instanceof Error ? err.message : err);
    return { away: 0, awayNotified: 0 };
  }
}
