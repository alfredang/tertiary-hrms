import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDaysBetween, roundToHalf, prorateLeave, getLeaveConflictDates } from "@/lib/utils";
import * as z from "zod";

const leaveEditSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  days: z.number().min(0.5, "Minimum 0.5 days").optional(),
  dayType: z.enum(["FULL_DAY", "AM_HALF", "PM_HALF"]).default("FULL_DAY"),
  halfDayPosition: z.enum(["first", "last"]).nullable().optional(),
  reason: z.string().optional(),
  documentUrl: z.string().optional(),
  documentFileName: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (leaveRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending leave requests can be edited" },
        { status: 400 }
      );
    }

    if (leaveRequest.employeeId !== session.user.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validation = leaveEditSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { startDate, endDate, days: submittedDays, dayType, halfDayPosition, reason, documentUrl, documentFileName } =
      validation.data;

    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);

    if (newEnd < newStart) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    // Calculate days based on dayType and halfDayPosition
    const isSingleDay = startDate === endDate;
    let newDays: number;

    if (isSingleDay) {
      newDays = dayType === "FULL_DAY" ? 1 : 0.5;
    } else if (halfDayPosition) {
      newDays = roundToHalf(calculateDaysBetween(newStart, newEnd) - 0.5);
    } else {
      newDays = submittedDays
        ? roundToHalf(submittedDays)
        : roundToHalf(calculateDaysBetween(newStart, newEnd));
    }

    const oldDays = Number(leaveRequest.days);

    // Get leave type code for overlap check (also used for proration below)
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: leaveRequest.leaveTypeId },
    });

    // Only AL supports half-day — force FULL_DAY for all other types
    const isAL = leaveType?.code === "AL";
    const effectiveDayType = isAL ? (isSingleDay ? dayType : "FULL_DAY") : "FULL_DAY";
    const effectiveHalfDayPosition = isAL ? (isSingleDay ? null : (halfDayPosition ?? null)) : null;

    // Recalculate days with effective values (non-AL always gets full days)
    if (!isAL) {
      newDays = submittedDays
        ? roundToHalf(submittedDays)
        : roundToHalf(calculateDaysBetween(newStart, newEnd));
    }

    // Check for overlapping leave requests (exclude self)
    const overlappingLeaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: leaveRequest.employeeId,
        id: { not: id },
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: newEnd },
        endDate: { gte: newStart },
      },
      select: {
        startDate: true, endDate: true, days: true,
        dayType: true, halfDayPosition: true,
        leaveType: { select: { code: true } },
      },
    });

    if (overlappingLeaves.length > 0) {
      const conflictDates = getLeaveConflictDates(
        newStart, newEnd, newDays, leaveType?.code || "",
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

    // Check leave balance
    const currentYear = new Date().getFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
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

    // Apply proration for AL/MC — same logic as POST /api/leave
    const employee = await prisma.employee.findUnique({
      where: { id: leaveRequest.employeeId },
      select: { startDate: true },
    });

    let effectiveEntitlement = Number(balance.entitlement);
    if ((leaveType?.code === "AL" || leaveType?.code === "MC") && employee?.startDate) {
      effectiveEntitlement = prorateLeave(Number(balance.entitlement), employee.startDate);
    }

    // Available = entitlement + carriedOver - used - (pending without the old reservation)
    const pendingWithoutOld = Number(balance.pending) - oldDays;
    const available =
      effectiveEntitlement +
      Number(balance.carriedOver) -
      Number(balance.used) -
      pendingWithoutOld;

    if (newDays > available) {
      return NextResponse.json(
        {
          error: "Insufficient leave balance",
          available,
          requested: newDays,
        },
        { status: 400 }
      );
    }

    const daysDelta = newDays - oldDays;

    await prisma.$transaction([
      prisma.leaveRequest.update({
        where: { id },
        data: {
          startDate: newStart,
          endDate: newEnd,
          days: newDays,
          dayType: effectiveDayType,
          halfDayPosition: effectiveHalfDayPosition,
          reason: reason ?? leaveRequest.reason,
          documentUrl: documentUrl !== undefined ? documentUrl : leaveRequest.documentUrl,
          documentFileName:
            documentFileName !== undefined ? documentFileName : leaveRequest.documentFileName,
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
        data: {
          pending: { increment: daysDelta },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error editing leave request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
