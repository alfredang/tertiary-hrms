import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

const resetSchema = z.object({
  reason: z.string().optional(),
});

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
    const validation = resetSchema.safeParse(body);
    const reason = validation.success ? validation.data.reason : undefined;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (leaveRequest.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cancelled leave requests cannot be reset" },
        { status: 400 }
      );
    }

    if (leaveRequest.status === "PENDING") {
      return NextResponse.json(
        { error: "Leave request is already pending" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    const days = Number(leaveRequest.days);
    const oldStatus = leaveRequest.status;
    const otDaysUsed = Number((leaveRequest as any).otDaysUsed) || 0;
    const deficitDays = Number((leaveRequest as any).deficitDays) || 0;

    // Build AL balance update
    // APPROVED → undo used+/pending- from approval; REJECTED/CANCELLED → just restore pending
    const balanceUpdate =
      oldStatus === "APPROVED"
        ? { used: { decrement: days }, pending: { increment: days } }
        : { pending: { increment: days } };

    await prisma.$transaction([
      prisma.leaveRequest.update({
        where: { id },
        data: {
          status: "PENDING",
          approverId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      }),
      prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: leaveRequest.employeeId,
            leaveTypeId: leaveRequest.leaveTypeId,
            year: currentYear,
          },
        },
        data: balanceUpdate,
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "RESET_TO_PENDING",
          entity: "LeaveRequest",
          entityId: id,
          oldValue: { status: oldStatus },
          newValue: { status: "PENDING", ...(reason ? { reason } : {}) },
        },
      }),
    ]);

    // Undo OT balance changes that were applied at approval
    if (oldStatus === "APPROVED" && (otDaysUsed > 0 || deficitDays > 0)) {
      const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
      if (alOtType) {
        const otUpdate: Record<string, any> = {};
        if (otDaysUsed > 0) {
          otUpdate.used = { decrement: otDaysUsed };
          otUpdate.pending = { increment: otDaysUsed };
        }
        if (deficitDays > 0) {
          otUpdate.autoDeducted = { decrement: deficitDays };
        }
        await prisma.leaveBalance.updateMany({
          where: {
            employeeId: leaveRequest.employeeId,
            leaveTypeId: alOtType.id,
            year: currentYear,
          },
          data: otUpdate,
        });
      }
    }

    // Delete linked calendar event
    if (oldStatus === "APPROVED") {
      await prisma.calendarEvent.deleteMany({ where: { leaveRequestId: id } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resetting leave request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
