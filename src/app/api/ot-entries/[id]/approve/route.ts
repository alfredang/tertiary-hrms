import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "HR", "MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const entry = await prisma.otEntry.findUnique({
    where: { id },
    include: { employee: { include: { user: true } } },
  });
  if (!entry) return NextResponse.json({ error: "OT entry not found" }, { status: 404 });
  if (entry.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Entry is not pending approval" }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();

  // Update OT entry status
  const updated = await prisma.otEntry.update({
    where: { id },
    data: {
      status: "APPROVED",
      approverId: session.user.employeeId ?? null,
      approvedAt: new Date(),
    },
  });

  // Find or auto-create the AL_OT leave type
  let alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
  if (!alOtType) {
    alOtType = await prisma.leaveType.create({
      data: {
        name: "Accumulated Leave (OT)",
        code: "AL_OT",
        defaultDays: 0,
        description: "Overtime/weekend work accumulated leave",
        carryOver: true,
        paid: true,
      },
    });
  }
  if (alOtType) {
    // Upsert leave balance for AL_OT and increment earned days
    const existing = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: entry.employeeId,
          leaveTypeId: alOtType.id,
          year: currentYear,
        },
      },
    });

    if (existing) {
      await prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: entry.employeeId,
            leaveTypeId: alOtType.id,
            year: currentYear,
          },
        },
        data: { earned: { increment: Number(entry.earnedDays) } },
      });
    } else {
      await prisma.leaveBalance.create({
        data: {
          employeeId: entry.employeeId,
          leaveTypeId: alOtType.id,
          year: currentYear,
          entitlement: 0,
          earned: Number(entry.earnedDays),
          used: 0,
          pending: 0,
          carriedOver: 0,
          autoDeducted: 0,
        },
      });
    }
  }

  // Notify the employee
  if (entry.employee.user) {
    await prisma.notification.create({
      data: {
        userId: entry.employee.user.id,
        title: "OT Leave Approved",
        message: `Your overtime work on ${new Date(entry.date).toLocaleDateString("en-SG")} has been approved. ${Number(entry.earnedDays)} day(s) added to your OT Leave balance.`,
        type: "OT_APPROVED",
        link: "/attendance",
      },
    });
  }

  return NextResponse.json(updated);
}
