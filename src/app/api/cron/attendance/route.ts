import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWeekend, toLocalDateString } from "@/lib/utils";
import { getSgHolidaysForYear } from "@/lib/sg-public-holidays";

// POST /api/cron/attendance
// Called by a cron scheduler (e.g. Vercel Cron at 08:00 SGT on weekdays).
// Checks each active employee: if they did NOT clock in on the previous working day
// and had no approved leave → deduct 1 day from OT leave balance (if available),
// otherwise flag as "Unexplained Absence" for admin review.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const currentYear = today.getFullYear();
  const sgHolidays = new Set(getSgHolidaysForYear(currentYear));

  // Find the previous working day (walk backwards from today)
  const prevDay = new Date(today);
  prevDay.setDate(prevDay.getDate() - 1);
  while (isWeekend(prevDay) || sgHolidays.has(toLocalDateString(prevDay))) {
    prevDay.setDate(prevDay.getDate() - 1);
  }
  const prevDayStr = toLocalDateString(prevDay);

  const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });

  // Get all active employees
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { user: true },
  });

  const results: { employeeId: string; action: string }[] = [];

  for (const emp of employees) {
    // Did they clock in on the previous working day?
    const attendance = await prisma.attendance.findFirst({
      where: {
        employeeId: emp.id,
        date: { gte: new Date(prevDayStr), lt: new Date(prevDayStr + "T23:59:59") },
      },
    });
    if (attendance) continue; // They clocked in — no action

    // Did they have approved leave on that day?
    const leave = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: emp.id,
        status: "APPROVED",
        startDate: { lte: new Date(prevDayStr + "T23:59:59") },
        endDate: { gte: new Date(prevDayStr) },
      },
    });
    if (leave) continue; // On approved leave — no action

    // No clock-in, no approved leave → absent
    if (!alOtType) {
      results.push({ employeeId: emp.id, action: "no_al_ot_type" });
      continue;
    }

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: emp.id,
          leaveTypeId: alOtType.id,
          year: currentYear,
        },
      },
    });

    const available = balance
      ? Number(balance.earned) - Number(balance.used) - Number(balance.autoDeducted)
      : 0;

    if (available >= 1) {
      // Deduct 1 day from OT leave balance
      await prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: emp.id,
            leaveTypeId: alOtType.id,
            year: currentYear,
          },
        },
        data: { autoDeducted: { increment: 1 } },
      });

      if (emp.user) {
        await prisma.notification.create({
          data: {
            userId: emp.user.id,
            title: "OT Leave Auto-Deducted",
            message: `1 OT leave day was automatically deducted for your absence on ${prevDayStr}. Remaining OT balance: ${available - 1} day(s).`,
            type: "AUTO_DEDUCT",
            link: "/leave",
          },
        });
      }
      results.push({ employeeId: emp.id, action: "auto_deducted" });
    } else {
      // No OT balance — flag for admin
      const adminUsers = await prisma.user.findMany({
        where: { roles: { has: "ADMIN" } },
        select: { id: true },
      });
      await prisma.notification.createMany({
        data: adminUsers.map((u) => ({
          userId: u.id,
          title: "Unexplained Absence",
          message: `${emp.name} did not clock in on ${prevDayStr} and has no approved leave or OT balance to deduct from.`,
          type: "UNEXPLAINED_ABSENCE",
          link: "/employees",
        })),
        skipDuplicates: true,
      });
      results.push({ employeeId: emp.id, action: "flagged_unexplained_absence" });
    }
  }

  return NextResponse.json({ date: prevDayStr, results });
}
