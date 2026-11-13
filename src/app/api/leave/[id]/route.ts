import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateWorkingDays, roundToHalf, prorateLeave, getLeaveConflictDates } from "@/lib/utils";
import {
  alExcessMessage,
  evaluateAlRequest,
  evaluateNplRequest,
  INTERN_MC_MESSAGE,
  isMedicalLeaveCode,
  mcAnnualEntitlement,
  nplCapMessage,
  NPL_CODE,
} from "@/lib/leave-policy";
import { getLeaveProfile, getNplStatus } from "@/lib/leave-allowance";
import { getAnnualLeaveBalance } from "@/lib/annual-leave";
import { annualLeaveAmounts, withinAnnualLeavePeriod } from "@/lib/annual-leave-policy";
import { getSgHolidaysForYear } from "@/lib/sg-public-holidays";
import * as z from "zod";

const leaveEditSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  days: z.number().min(0.5, "Minimum 0.5 days").optional(),
  dayType: z.enum(["FULL_DAY", "AM_HALF", "PM_HALF"]).default("FULL_DAY"),
  halfDayPosition: z.enum(["first", "last"]).nullable().optional(),
  reason: z.string().optional(),
  documentUrl: z.string().nullable().optional(),
  documentFileName: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, employeeId: true, department: { select: { name: true } } } },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { name: true } },
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = ["ADMIN", "MANAGER", "HR"].includes(session.user.role);
  const isOwner = request.employeeId === session.user.employeeId;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(request);
}

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

    // Fetch holidays for working-day calculation
    // Every year the leave covers — a Dec–Jan request needs next year's holidays (e.g. 1 Jan).
    const years = Array.from({ length: newEnd.getFullYear() - newStart.getFullYear() + 1 }, (_, i) => newStart.getFullYear() + i);
    const dbHolidays = await prisma.publicHoliday.findMany({ where: { year: { in: years }, countryCode: "SG" } });
    const allHolidayDates = Array.from(
      new Set([...years.flatMap(getSgHolidaysForYear), ...dbHolidays.map((h) => h.date.toISOString().slice(0, 10))])
    );

    // Calculate working days based on dayType and halfDayPosition
    const isSingleDay = startDate === endDate;
    let newDays: number;

    if (isSingleDay) {
      newDays = dayType === "FULL_DAY" ? 1 : 0.5;
    } else if (halfDayPosition) {
      const { workingDays: wd } = calculateWorkingDays(newStart, newEnd, allHolidayDates);
      newDays = roundToHalf(wd - 0.5);
    } else {
      const { workingDays: wd } = calculateWorkingDays(newStart, newEnd, allHolidayDates);
      newDays = submittedDays ? roundToHalf(submittedDays) : roundToHalf(wd);
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

    // Recalculate days with effective values (non-AL always gets full working days)
    if (!isAL) {
      const { workingDays: wd } = calculateWorkingDays(newStart, newEnd, allHolidayDates);
      newDays = submittedDays ? roundToHalf(submittedDays) : roundToHalf(wd);
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

    // Check leave balance for non-AL types only
    const currentYear = new Date().getFullYear();
    const balance = isAL ? await getAnnualLeaveBalance(leaveRequest.employeeId, leaveRequest.leaveTypeId) : await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: leaveRequest.balanceYear ?? currentYear,
        },
      },
    });

    if (!balance) {
      return NextResponse.json(
        { error: "No leave balance found for this leave type" },
        { status: 400 }
      );
    }

    if (isAL && !withinAnnualLeavePeriod(balance, newStart, newEnd)) {
      return NextResponse.json({ error: "Annual leave must fall within your internship entitlement period." }, { status: 400 });
    }

    // Same policy as submission (src/lib/leave-policy.ts), with this request's own days excluded.
    const employee = await getLeaveProfile(leaveRequest.employeeId);
    const isMedical = isMedicalLeaveCode(leaveType?.code);
    const oldBalanceDays = Number(leaveRequest.balanceDays ?? oldDays);
    const pendingWithoutOld = Number(balance.pending) - oldBalanceDays;

    if (isMedical && employee?.isIntern) {
      return NextResponse.json(
        { error: INTERN_MC_MESSAGE, code: "INTERN_MC_NOT_PAID", suggestedLeaveTypeCode: NPL_CODE },
        { status: 400 }
      );
    }

    if (leaveType?.code === NPL_CODE) {
      const npl = await getNplStatus(leaveRequest.employeeId, employee, new Date(), id);
      if (!evaluateNplRequest(newDays, npl).ok) {
        return NextResponse.json(
          { error: nplCapMessage(newDays, npl), code: "NPL_CAP_EXCEEDED", npl, requested: newDays },
          { status: 400 }
        );
      }
    } else if (isAL) {
      const entitlement = Number(balance.entitlement);
      const amounts = annualLeaveAmounts({ entitlement, used: Number(balance.used), pending: pendingWithoutOld,
        carriedOver: Number(balance.carriedOver), recordedEarned: Number(balance.earned), periodStart: balance.periodStart, periodEnd: balance.periodEnd }, employee);
      const earnedAvailable = amounts.remaining;
      const fullAvailable = amounts.fullAvailable;
      const otHeld = Number(leaveRequest.otDaysUsed);
      const alCheck = evaluateAlRequest({
        days: newDays,
        earnedAvailable,
        fullAvailable,
        otAvailable: otHeld,
        otRequested: otHeld,
        useAdvance: true,
      });
      // Edits that don't lengthen the request stay allowed, so a pending pre-policy
      // request (recorded with a deficit) can still have its reason/dates tidied.
      if (!alCheck.ok && newDays > oldDays) {
        const npl = await getNplStatus(leaveRequest.employeeId, employee);
        return NextResponse.json(
          {
            error: alExcessMessage(alCheck, newDays, npl.remaining),
            code: "AL_EXCEEDS_BALANCE",
            excessDays: alCheck.excessDays,
            npl,
            suggestedLeaveTypeCode: NPL_CODE,
          },
          { status: 400 }
        );
      }
    } else {
      let effectiveEntitlement = Number(balance.entitlement);
      if (leaveType?.code === "AL_OT") {
        effectiveEntitlement = Number(balance.earned) - Number(balance.autoDeducted);
      } else if (isMedical) {
        effectiveEntitlement = prorateLeave(
          mcAnnualEntitlement(Number(balance.entitlement), !!employee?.isIntern),
          employee?.startDate,
          null,
          false,
          new Date(),
          employee?.endDate,
        );
      }

      const available =
        effectiveEntitlement +
        (leaveType?.code === "AL_OT" ? 0 : Number(balance.carriedOver)) -
        Number(balance.used) -
        pendingWithoutOld;

      if (newDays > available) {
        return NextResponse.json(
          { error: "Insufficient leave balance", available, requested: newDays },
          { status: 400 }
        );
      }
    }

    const contractAl = !!balance.periodStart && isAL;
    const oldOtDays = Number(leaveRequest.otDaysUsed);
    const newOtDays = contractAl ? Math.min(oldOtDays, newDays) : oldOtDays;
    const newBalanceDays = contractAl ? newDays - newOtDays : newDays;
    const daysDelta = newBalanceDays - oldBalanceDays;

    await prisma.$transaction([
      prisma.leaveRequest.update({
        where: { id },
        data: {
          startDate: newStart,
          endDate: newEnd,
          days: newDays,
          ...(contractAl ? { balanceDays: newBalanceDays, balanceYear: balance.year, otDaysUsed: newOtDays } : {}),
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
            year: balance.year ?? currentYear,
          },
        },
        data: {
          pending: { increment: daysDelta },
        },
      }),
      ...(contractAl && oldOtDays > newOtDays ? [prisma.leaveBalance.updateMany({
        where: { employeeId: leaveRequest.employeeId, leaveType: { code: "AL_OT" }, year: leaveRequest.createdAt.getFullYear() },
        data: { pending: { decrement: oldOtDays - newOtDays } },
      })] : []),
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
