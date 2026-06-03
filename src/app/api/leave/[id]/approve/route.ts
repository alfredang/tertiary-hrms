import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const approvalComment: string | undefined = body?.approvalComment?.trim() || undefined;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (leaveRequest.status !== "PENDING") {
      return NextResponse.json({ error: "Leave request is not pending" }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();
    const otDaysUsed = Number(leaveRequest.otDaysUsed);
    const deficitDays = Number(leaveRequest.deficitDays);

    // Update leave request status
    const updatedRequest = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: session.user.employeeId,
        approvedAt: new Date(),
        ...(approvalComment ? { approvalComment } : {}),
      },
    });

    // Move AL days from pending → used
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

    // Handle OT balance adjustments
    if (otDaysUsed > 0 || deficitDays > 0) {
      const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
      if (alOtType) {
        const otUpdateData: Record<string, any> = {};
        if (otDaysUsed > 0) {
          otUpdateData.used = { increment: otDaysUsed };
          otUpdateData.pending = { decrement: otDaysUsed };
        }
        // Record deficit as autoDeducted so remaining can go negative
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
    }

    // Create calendar event
    let eventTitle = `${leaveRequest.employee.name} - ${leaveRequest.leaveType.name}`;
    if (leaveRequest.dayType === "AM_HALF") eventTitle += " (AM Half)";
    else if (leaveRequest.dayType === "PM_HALF") eventTitle += " (PM Half)";
    else if (leaveRequest.halfDayPosition) eventTitle += ` (half on ${leaveRequest.halfDayPosition} day)`;

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

    // Notify employee
    try {
      let msg = `Your ${leaveRequest.leaveType.name} request (${Number(leaveRequest.days)} day(s)) has been approved.`;
      if (approvalComment) msg += ` Note: ${approvalComment}`;
      if (deficitDays > 0) {
        msg += ` ${deficitDays} day(s) will be recorded as deficit and offset by future Off In Lieu earnings.`;
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
      // Non-critical
    }

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error approving leave:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
