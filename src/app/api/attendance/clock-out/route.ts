import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toLocalDateString } from "@/lib/utils";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeId = session.user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee record" }, { status: 400 });

  const now = new Date();
  const today = toLocalDateString(now);

  const record = await prisma.attendance.findFirst({
    where: {
      employeeId,
      date: { gte: new Date(today), lt: new Date(today + "T23:59:59") },
      clockOut: null,
    },
  });

  if (!record) {
    return NextResponse.json({ error: "No active clock-in found for today" }, { status: 400 });
  }

  const totalMs = now.getTime() - record.clockIn.getTime();
  const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;

  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: { clockOut: now, totalHours },
  });

  // Create OT entry for weekend or public holiday work (>= 4 hours)
  if (record.dayType !== "WEEKDAY" && totalHours >= 4) {
    const earnedDays = totalHours >= 8 ? 1.0 : 0.5;

    const otEntry = await prisma.otEntry.upsert({
      where: { attendanceId: record.id },
      update: { hoursWorked: totalHours, earnedDays },
      create: {
        employeeId,
        attendanceId: record.id,
        date: record.date,
        hoursWorked: totalHours,
        earnedDays,
        dayType: record.dayType,
        status: "PENDING_APPROVAL",
      },
    });

    // Notify admins about new OT entry
    const adminUsers = await prisma.user.findMany({
      where: { roles: { has: "ADMIN" } },
      select: { id: true },
    });
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true },
    });
    await prisma.notification.createMany({
      data: adminUsers.map((u) => ({
        userId: u.id,
        title: "New OT Work Entry",
        message: `${employee?.name ?? "An employee"} worked on ${record.dayType === "PUBLIC_HOLIDAY" ? "a public holiday" : "the weekend"} (${today}). ${earnedDays} day(s) pending your approval.`,
        type: "OT_PENDING",
        link: "/attendance/ot-approvals",
      })),
    });

    return NextResponse.json({ attendance: updated, otEntry }, { status: 200 });
  }

  return NextResponse.json({ attendance: updated }, { status: 200 });
}
