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

    // Check if user has permission to reject
    if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { include: { user: true } }, leaveType: true },
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
        status: "REJECTED",
        approverId: session.user.employeeId,
        rejectedAt: new Date(),
        rejectionReason: reason || null,
      },
    });

    // Update leave balance - remove from pending
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
        pending: { decrement: Number(leaveRequest.days) },
      },
    });

    // Notify the employee
    try {
      if (leaveRequest.employee?.user) {
        await prisma.notification.create({
          data: {
            userId: leaveRequest.employee.user.id,
            title: "Leave Request Rejected",
            message: `Your ${(leaveRequest as any).leaveType?.name ?? "leave"} request was rejected.${reason ? ` Reason: ${reason}` : ""}`,
            type: "LEAVE_REJECTED",
            link: "/leave",
          },
        });
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error rejecting leave:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
