import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Bulk-approve multiple PENDING leave requests in one shot.
// Mirrors the single-approve logic in /api/leave/[id]/approve so balance
// movements, calendar events, and notifications all stay consistent.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const approverEmployeeId = session.user.employeeId;
  const currentYear = new Date().getFullYear();
  const results: { approved: string[]; skipped: { id: string; reason: string }[] } = {
    approved: [],
    skipped: [],
  };

  const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });

  for (const id of ids) {
    try {
      const leaveRequest = await prisma.leaveRequest.findUnique({
        where: { id },
        include: { employee: true, leaveType: true },
      });
      if (!leaveRequest) {
        results.skipped.push({ id, reason: "not found" });
        continue;
      }
      if (leaveRequest.status !== "PENDING") {
        results.skipped.push({ id, reason: `status is ${leaveRequest.status}` });
        continue;
      }

      const otDaysUsed = Number(leaveRequest.otDaysUsed);
      const deficitDays = Number(leaveRequest.deficitDays);

      await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approverId: approverEmployeeId,
          approvedAt: new Date(),
        },
      });

      await prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: leaveRequest.employeeId,
            leaveTypeId: leaveRequest.leaveTypeId,
            year: currentYear,
          },
        },
        data: {
          used: { increment: Number(leaveRequest.days) },
          pending: { decrement: Number(leaveRequest.days) },
        },
      });

      if ((otDaysUsed > 0 || deficitDays > 0) && alOtType) {
        const otUpdateData: Record<string, unknown> = {};
        if (otDaysUsed > 0) {
          otUpdateData.used = { increment: otDaysUsed };
          otUpdateData.pending = { decrement: otDaysUsed };
        }
        if (deficitDays > 0) {
          otUpdateData.autoDeducted = { increment: deficitDays };
        }
        await prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: leaveRequest.employeeId,
              leaveTypeId: alOtType.id,
              year: currentYear,
            },
          },
          update: otUpdateData,
          create: {
            employeeId: leaveRequest.employeeId,
            leaveTypeId: alOtType.id,
            year: currentYear,
            entitlement: 0,
            earned: 0,
            used: otDaysUsed,
            autoDeducted: deficitDays,
            pending: 0,
          },
        });
      }

      // Calendar event
      let eventTitle = `${leaveRequest.employee.name} - ${leaveRequest.leaveType.name}`;
      if (leaveRequest.dayType === "AM_HALF") eventTitle += " (AM Half)";
      else if (leaveRequest.dayType === "PM_HALF") eventTitle += " (PM Half)";
      else if (leaveRequest.halfDayPosition) eventTitle += ` (half on ${leaveRequest.halfDayPosition} day)`;
      try {
        await prisma.calendarEvent.create({
          data: {
            title: eventTitle,
            startDate: leaveRequest.startDate,
            endDate: leaveRequest.endDate,
            allDay: true,
            type: "LEAVE",
            color: "#f59e0b",
            leaveRequestId: leaveRequest.id,
          },
        });
      } catch {
        // non-fatal
      }

      // Notify
      try {
        let msg = `Your ${leaveRequest.leaveType.name} request (${Number(leaveRequest.days)} day(s)) has been approved.`;
        if (deficitDays > 0) {
          msg += ` Note: ${deficitDays} day(s) will be recorded as deficit and offset by future OT earnings.`;
        }
        await prisma.notification.create({
          data: {
            userId: leaveRequest.employee.userId,
            title: "Leave Request Approved",
            message: msg,
            type: "LEAVE_APPROVED",
            link: "/leave",
          },
        });
      } catch {
        // non-fatal
      }

      results.approved.push(id);
    } catch (err) {
      console.error(`Bulk-approve failed for leave ${id}:`, err);
      results.skipped.push({ id, reason: err instanceof Error ? err.message : "error" });
    }
  }

  return NextResponse.json(results);
}
