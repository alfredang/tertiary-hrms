import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDaysBetween, roundToHalf, prorateLeave } from "@/lib/utils";
import * as z from "zod";

const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  days: z.number().min(0.5, "Minimum 0.5 days").optional(),
  reason: z.string().optional(),
  documentUrl: z.string().optional(),
  documentFileName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    let employeeId: string | undefined;

    if (process.env.SKIP_AUTH !== "true") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      employeeId = session.user.employeeId;
    } else {
      // Dev mode: use admin employee as default
      const adminUser = await prisma.user.findUnique({
        where: { email: "admin@tertiaryinfotech.com" },
        include: { employee: true },
      });
      employeeId = adminUser?.employee?.id;
    }

    if (!employeeId) {
      return NextResponse.json(
        { error: "No employee record found for this user" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validation = leaveRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { leaveTypeId, startDate, endDate, days: submittedDays, reason, documentUrl, documentFileName } = validation.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    // Use user-submitted days if provided, otherwise calculate from dates
    const days = submittedDays
      ? roundToHalf(submittedDays)
      : roundToHalf(calculateDaysBetween(start, end));

    // Check leave balance
    const currentYear = new Date().getFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId,
          year: currentYear,
        },
      },
    });

    if (!balance) {
      return NextResponse.json(
        { error: "No leave balance found for this leave type" },
        { status: 400 }
      );
    }

    // Get leave type code and employee start date for proration
    const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { startDate: true },
    });

    let effectiveEntitlement = Number(balance.entitlement);

    // Annual Leave: prorated based on employee start date
    // No Pay Leave, MC, CL: full entitlement (no proration)
    if (leaveType?.code === "AL" && employee?.startDate) {
      effectiveEntitlement = prorateLeave(Number(balance.entitlement), employee.startDate);
    }

    const available =
      effectiveEntitlement +
      Number(balance.carriedOver) -
      Number(balance.used) -
      Number(balance.pending);

    if (days > available) {
      return NextResponse.json(
        {
          error: "Insufficient leave balance",
          available,
          requested: days,
        },
        { status: 400 }
      );
    }

    // Create leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        id: `lr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        employeeId,
        leaveTypeId,
        startDate: start,
        endDate: end,
        days,
        reason: reason || null,
        documentUrl: documentUrl || null,
        documentFileName: documentFileName || null,
        status: "PENDING",
      },
      include: {
        leaveType: true,
        employee: {
          select: { name: true },
        },
      },
    });

    // Update leave balance - increment pending
    await prisma.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId,
          year: currentYear,
        },
      },
      data: {
        pending: { increment: days },
      },
    });

    return NextResponse.json(leaveRequest, { status: 201 });
  } catch (error) {
    console.error("Error creating leave request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
