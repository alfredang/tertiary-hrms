import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDaysBetween, roundToHalf, prorateLeave, getLeaveConflictDates } from "@/lib/utils";
import * as z from "zod";

const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  days: z.number().min(0.5, "Minimum 0.5 days").optional(),
  dayType: z.enum(["FULL_DAY", "AM_HALF", "PM_HALF"]).default("FULL_DAY"),
  halfDayPosition: z.enum(["first", "last"]).nullable().optional(),
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

    const { leaveTypeId, startDate, endDate, days: submittedDays, dayType, halfDayPosition, reason, documentUrl, documentFileName } = validation.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    // Calculate days based on dayType and halfDayPosition
    const isSingleDay = startDate === endDate;
    let days: number;

    if (isSingleDay) {
      days = dayType === "FULL_DAY" ? 1 : 0.5;
    } else if (halfDayPosition) {
      days = roundToHalf(calculateDaysBetween(start, end) - 0.5);
    } else {
      days = submittedDays
        ? roundToHalf(submittedDays)
        : roundToHalf(calculateDaysBetween(start, end));
    }

    // Get leave type code and employee start date (needed for overlap check + proration)
    const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { startDate: true },
    });

    // Only AL supports half-day — force FULL_DAY for all other types
    const isAL = leaveType?.code === "AL";
    const effectiveDayType = isAL ? (isSingleDay ? dayType : "FULL_DAY") : "FULL_DAY";
    const effectiveHalfDayPosition = isAL ? (isSingleDay ? null : (halfDayPosition ?? null)) : null;

    // Recalculate days with effective values (non-AL always gets full days)
    if (!isAL) {
      days = submittedDays
        ? roundToHalf(submittedDays)
        : roundToHalf(calculateDaysBetween(start, end));
    }

    // Check for overlapping leave requests
    const overlappingLeaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: {
        startDate: true, endDate: true, days: true,
        dayType: true, halfDayPosition: true,
        leaveType: { select: { code: true } },
      },
    });

    if (overlappingLeaves.length > 0) {
      const conflictDates = getLeaveConflictDates(
        start, end, days, leaveType?.code || "",
        effectiveDayType,
        effectiveHalfDayPosition,
        overlappingLeaves.map(l => ({
          startDate: l.startDate, endDate: l.endDate,
          days: Number(l.days), leaveTypeCode: l.leaveType.code,
          dayType: l.dayType, halfDayPosition: l.halfDayPosition,
        }))
      );
      if (conflictDates.length > 0) {
        return NextResponse.json(
          {
            error: `Leave overlaps with existing request on: ${conflictDates.join(", ")}. Please choose different dates or use a half-day if applying for a medical leave on the same day.`,
          },
          { status: 400 }
        );
      }
    }

    // Check leave balance — auto-create if missing (e.g. new year, new employee)
    const currentYear = new Date().getFullYear();
    let balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId,
          year: currentYear,
        },
      },
    });

    if (!balance && leaveType) {
      balance = await prisma.leaveBalance.create({
        data: {
          employeeId,
          leaveTypeId,
          year: currentYear,
          entitlement: leaveType.defaultDays,
          used: 0,
          pending: 0,
          carriedOver: 0,
        },
      });
    }

    if (!balance) {
      return NextResponse.json(
        { error: "No leave balance found for this leave type" },
        { status: 400 }
      );
    }

    let effectiveEntitlement = Number(balance.entitlement);

    // Annual Leave & Medical Leave: prorated based on employee start date
    // No Pay Leave, CL: full entitlement (no proration)
    if ((leaveType?.code === "AL" || leaveType?.code === "MC") && employee?.startDate) {
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
        dayType: effectiveDayType,
        halfDayPosition: effectiveHalfDayPosition,
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
