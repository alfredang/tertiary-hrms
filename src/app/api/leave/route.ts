import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateWorkingDays, roundToHalf, prorateLeave, getLeaveConflictDates, computeAlFullEntitlement } from "@/lib/utils";
import { getSgHolidaysForYear } from "@/lib/sg-public-holidays";
import * as z from "zod";
import path from "path";
import { readFile } from "fs/promises";
import { Readable } from "stream";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getEmployeeSubfolderId, getDriveClient } from "@/lib/drive";

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
  otDaysUsed: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  try {
    let employeeId: string | undefined;

    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      employeeId = session.user.employeeId;
    } else {
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

    const { leaveTypeId, startDate, endDate, days: submittedDays, dayType, halfDayPosition, reason, documentUrl, documentFileName, otDaysUsed } = validation.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    // Fetch public holidays for working-day calculation
    const year = start.getFullYear();
    const dbHolidays = await prisma.publicHoliday.findMany({ where: { year, countryCode: "SG" } });
    const staticHolidays = getSgHolidaysForYear(year);
    const allHolidayDates = Array.from(
      new Set([...staticHolidays, ...dbHolidays.map((h) => h.date.toISOString().slice(0, 10))])
    );

    // Calculate working days based on dayType and halfDayPosition
    const isSingleDay = startDate === endDate;
    let days: number;

    if (isSingleDay) {
      const { workingDays: wd } = calculateWorkingDays(start, end, allHolidayDates);
      if (wd === 0) {
        return NextResponse.json(
          { error: "The selected date is a weekend or public holiday. Please choose a working day." },
          { status: 400 }
        );
      }
      days = dayType === "FULL_DAY" ? 1 : 0.5;
    } else if (halfDayPosition) {
      const { workingDays: wd } = calculateWorkingDays(start, end, allHolidayDates);
      days = roundToHalf(wd - 0.5);
    } else {
      const { workingDays: wd } = calculateWorkingDays(start, end, allHolidayDates);
      days = submittedDays ? roundToHalf(submittedDays) : roundToHalf(wd);
    }

    const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { startDate: true, monthlyLeaveRate: true },
    });

    const isAL = leaveType?.code === "AL";
    const isOT = leaveType?.code === "AL_OT";

    const effectiveDayType = isAL ? (isSingleDay ? dayType : "FULL_DAY") : "FULL_DAY";
    const effectiveHalfDayPosition = isAL ? (isSingleDay ? null : (halfDayPosition ?? null)) : null;

    if (!isAL) {
      const { workingDays: wd } = calculateWorkingDays(start, end, allHolidayDates);
      days = submittedDays ? roundToHalf(submittedDays) : roundToHalf(wd);
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
        if (isSingleDay && effectiveDayType !== "FULL_DAY") {
          const complementaryType = effectiveDayType === "AM_HALF" ? "PM_HALF" : "AM_HALF";
          const hasComplementary = overlappingLeaves.some(l => {
            const lSingleDay = l.startDate.toISOString().slice(0, 10) === l.endDate.toISOString().slice(0, 10);
            return lSingleDay && l.dayType === complementaryType;
          });
          if (hasComplementary) {
            return NextResponse.json(
              {
                error: `You already have a half-day leave on ${conflictDates[0]}. Please edit the existing request to a full day instead of submitting a separate half-day.`,
              },
              { status: 400 }
            );
          }
        }
        return NextResponse.json(
          {
            error: `Leave overlaps with existing request on: ${conflictDates.join(", ")}. Please choose different dates or use a half-day if applying for a medical leave on the same day.`,
          },
          { status: 400 }
        );
      }
    }

    // Check/create leave balance
    const currentYear = new Date().getFullYear();
    let balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: currentYear } },
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

    // Calculate available balance
    let available: number;

    if (isOT) {
      available = Number(balance.earned) - Number(balance.used) - Number(balance.autoDeducted) - Number(balance.pending);
    } else {
      let effectiveEntitlement = Number(balance.entitlement);
      if (isAL && employee?.startDate) {
        effectiveEntitlement = prorateLeave(Number(balance.entitlement), employee.startDate, null, true);
      } else if (leaveType?.code === "MC" && employee?.startDate) {
        effectiveEntitlement = prorateLeave(
          Number(balance.entitlement),
          employee.startDate,
          employee.monthlyLeaveRate ? Number(employee.monthlyLeaveRate) : null,
        );
      }
      available = effectiveEntitlement + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending);
    }

    // For non-AL leave types: hard block if insufficient balance
    if (!isAL && days > available) {
      return NextResponse.json(
        { error: "Insufficient leave balance", available, requested: days },
        { status: 400 }
      );
    }

    // For AL: allow deficit. Validate OT usage if provided.
    let resolvedOtDaysUsed = 0;
    let deficitDays = 0;

    if (isAL) {
      // Clamp otDaysUsed to what's actually available in OT balance
      if (otDaysUsed > 0) {
        const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
        if (alOtType) {
          const otBalance = await prisma.leaveBalance.findUnique({
            where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year: currentYear } },
          });
          const otAvailable = otBalance
            ? Math.max(0, Number(otBalance.earned) - Number(otBalance.used) - Number(otBalance.autoDeducted) - Number(otBalance.pending))
            : 0;
          resolvedOtDaysUsed = Math.min(otDaysUsed, otAvailable);
        }
      }
      // Deficit = days beyond the FULL year entitlement (not prorated to today).
      // Using within-entitlement days ahead of accrual = advance AL, not deficit.
      const monthlyLeaveRate = employee?.monthlyLeaveRate ? Number(employee.monthlyLeaveRate) : null;
      const fullEntitlement = computeAlFullEntitlement(employee?.startDate, monthlyLeaveRate);
      const fullAvailable = fullEntitlement + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending);
      deficitDays = Math.max(0, days - fullAvailable - resolvedOtDaysUsed);
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
        otDaysUsed: resolvedOtDaysUsed,
        deficitDays,
      },
      include: {
        leaveType: true,
        employee: { select: { name: true } },
      },
    });

    // Mirror supporting document to Drive (MC → Medical Certificates folder)
    if (documentUrl) {
      try {
        const driveResult = await mirrorLeaveDocToDrive({
          employeeId,
          documentUrl,
          documentFileName,
          leaveRequestId: leaveRequest.id,
          leaveTypeCode: leaveRequest.leaveType.code,
          startDate,
        });
        if (driveResult) {
          await prisma.leaveRequest.update({
            where: { id: leaveRequest.id },
            data: {
              driveFileId: driveResult.id,
              driveWebViewLink: driveResult.webViewLink ?? undefined,
            },
          });
        }
      } catch (err) {
        console.error(`Drive mirror failed for leave ${leaveRequest.id}:`, err);
      }
    }

    // Update AL balance pending
    await prisma.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: currentYear } },
      data: { pending: { increment: days } },
    });

    // Update OT balance pending if OT days were used
    if (resolvedOtDaysUsed > 0) {
      const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
      if (alOtType) {
        await prisma.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year: currentYear } },
          update: { pending: { increment: resolvedOtDaysUsed } },
          create: { employeeId, leaveTypeId: alOtType.id, year: currentYear, entitlement: 0, earned: 0, pending: resolvedOtDaysUsed },
        });
      }
    }

    // Notify admins/HR/managers
    try {
      const approvers = await prisma.user.findMany({
        where: { roles: { hasSome: ["ADMIN", "HR", "MANAGER"] } },
        select: { id: true },
      });
      let msg = `${leaveRequest.employee.name} submitted a ${leaveRequest.leaveType.name} request for ${Number(leaveRequest.days)} day(s).`;
      if (deficitDays > 0) msg += ` ⚠ ${deficitDays} day(s) deficit.`;
      await prisma.notification.createMany({
        data: approvers.map((u) => ({
          userId: u.id,
          title: "New Leave Request",
          message: msg,
          type: "LEAVE_SUBMITTED",
          link: "/leave",
        })),
        skipDuplicates: true,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(leaveRequest, { status: 201 });
  } catch (error) {
    console.error("Error creating leave request:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function mirrorLeaveDocToDrive(args: {
  employeeId: string;
  documentUrl: string;
  documentFileName?: string;
  leaveRequestId: string;
  leaveTypeCode: string;
  startDate: string;
}): Promise<{ id: string; webViewLink: string | null } | null> {
  const localPrefix = "/api/uploads/";
  if (!args.documentUrl.startsWith(localPrefix)) return null;
  const uniqueName = args.documentUrl.slice(localPrefix.length);
  const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const filePath = path.join(uploadsDir, uniqueName);
  const buffer = await readFile(filePath);
  const ext = path.extname(uniqueName).toLowerCase();
  const mime = EXTENSION_TO_MIME[ext] || "application/octet-stream";

  const isMedical = ["MC", "SL", "MEDICAL"].includes(args.leaveTypeCode);
  const subfolder = isMedical ? "Medical Certificates" : "Other Documents";
  const folderId = await getEmployeeSubfolderId(args.employeeId, subfolder);
  if (!folderId) return null;

  const driveName = `${args.startDate.slice(0, 10)}_${args.leaveRequestId}${args.documentFileName ? `_${args.documentFileName}` : ext}`;
  const drive = await getDriveClient();
  const created = await drive.files.create({
    requestBody: { name: driveName, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!created.data.id) return null;
  return { id: created.data.id, webViewLink: created.data.webViewLink ?? null };
}
