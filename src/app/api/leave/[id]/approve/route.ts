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

    // Check if user has permission to approve
    if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (leaveRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Leave request is not pending" },
        { status: 400 }
      );
    }

    // Update leave request
    const updatedRequest = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: session.user.employeeId,
        approvedAt: new Date(),
      },
    });

    // Update leave balance
    const currentYear = new Date().getFullYear();
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

    // Create calendar event for approved leave
    await prisma.calendarEvent.create({
      data: {
        title: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName} - ${leaveRequest.leaveType.name}`,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        allDay: true,
        type: "LEAVE",
        color: "#f59e0b",
        leaveRequestId: leaveRequest.id,
      },
    });

    // TODO: Send email notification to employee

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error approving leave:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
