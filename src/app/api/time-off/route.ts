import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { computeTimeOffHours, timeOffReasonLabel, isOffDay, appSafeTimeOffReason, OFF_DAY_START, OFF_DAY_END } from "@/lib/time-off";
import { isScheduledWorkday } from "@/lib/attendance-policy";
import { sendTimeOffApprovalEmail } from "@/lib/approval-email";
import { notifyApprovers } from "@/lib/admin-alerts";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import type { TimeOffReason } from "@prisma/client";
import { isDemoEmployee } from "@/lib/demo-guard";

export const dynamic = "force-dynamic";

const VALID_REASONS: TimeOffReason[] = ["OFF_DAY", "EXAMS", "EMERGENCY", "UNPAID_LEAVE", "OTHERS"];

async function resolveActor() {
  if (isDevAuthSkipped()) {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    return { employeeId: adminUser?.employee?.id, isAdmin: true };
  }
  const session = await auth();
  if (!session?.user) return null;
  return {
    employeeId: session.user.employeeId,
    isAdmin: hasAdminAccess(session.user.role),
  };
}

// GET /api/time-off — own requests; admins/managers see everyone's.
export async function GET() {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.timeOffRequest.findMany({
    where: actor.isAdmin ? {} : { employeeId: actor.employeeId ?? "__none__" },
    include: {
      employee: { select: { id: true, name: true, department: { select: { name: true } } } },
      approver: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  // Read only by the native apps (the web pages query Prisma directly).
  return NextResponse.json(requests.map((r) => appSafeTimeOffReason(r)));
}

// POST /api/time-off — submit a new request for the signed-in employee.
export async function POST(req: Request) {
  try {
    const actor = await resolveActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.employeeId) {
      return NextResponse.json({ error: "No employee record linked to this account" }, { status: 400 });
    }

    const body = await req.json();
    const { date, reason } = body ?? {};
    const reasonDetail: string | undefined = body?.reasonDetail?.trim() || undefined;
    // An Off Day is a whole day: the times are fixed and it counts 0 hours.
    const offDay = isOffDay(reason);
    const startTime: string | undefined = offDay ? OFF_DAY_START : body?.startTime;
    const endTime: string | undefined = offDay ? OFF_DAY_END : body?.endTime;

    if (!date || !startTime || !endTime || !reason) {
      return NextResponse.json(
        { error: "date, startTime, endTime and reason are required" },
        { status: 400 }
      );
    }

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
    }

    if (reason === "OTHERS" && !reasonDetail) {
      return NextResponse.json(
        { error: "Please specify the reason when selecting Others" },
        { status: 400 }
      );
    }

    const hours = offDay ? 0 : computeTimeOffHours(startTime, endTime);
    if (hours === null) {
      return NextResponse.json(
        { error: "End time must be later than start time, and both must be valid times" },
        { status: 400 }
      );
    }

    // Date-only column — anchor at UTC midnight so the stored day matches what
    // the employee picked regardless of server timezone.
    const requestDate = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(requestDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    if (offDay) {
      const emp = await prisma.employee.findUnique({
        where: { id: actor.employeeId },
        select: { workdays: true, startDate: true, endDate: true },
      });
      if (emp && !isScheduledWorkday(emp.workdays, requestDate)) {
        return NextResponse.json(
          { error: "That day is already not one of your workdays, so no Off Day is needed." },
          { status: 400 }
        );
      }
    }

    // Reject an overlapping request on the same day (pending or approved).
    // An Off Day covers the whole day, so it clashes with any request that day.
    const sameDay = await prisma.timeOffRequest.findMany({
      where: {
        employeeId: actor.employeeId,
        date: requestDate,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { startTime: true, endTime: true, reason: true },
    });

    const overlaps = sameDay.some(
      (r) => offDay || isOffDay(r.reason) || (startTime < r.endTime && endTime > r.startTime)
    );
    if (overlaps) {
      return NextResponse.json(
        {
          error: offDay
            ? "You already have a time off request on that day."
            : "You already have a time off request covering part of that time.",
        },
        { status: 400 }
      );
    }

    const created = await prisma.timeOffRequest.create({
      data: {
        employeeId: actor.employeeId,
        date: requestDate,
        startTime,
        endTime,
        hours,
        reason,
        reasonDetail: reasonDetail ?? null,
        status: "PENDING",
      },
      include: { employee: { select: { name: true } } },
    });

    // Notify the admins (in-app + phone push). Demo / App Review accounts never notify real approvers.
    if (!(await isDemoEmployee(actor.employeeId))) {
      const detail = reasonDetail ? ` — ${reasonDetail}` : "";
      await notifyApprovers({
        title: "New Time Off request",
        message: offDay
          ? `${created.employee.name} requested an Off Day on ${String(date).slice(0, 10)}${detail}.`
          : `${created.employee.name} requested ${hours}h time off on ${String(date).slice(0, 10)} (${timeOffReasonLabel(reason)})${detail}.`,
        type: "TIME_OFF_SUBMITTED",
        link: "/time-off",
      });
    }

    // Send email to approvers (best effort).
    try {
      await sendTimeOffApprovalEmail({
        timeOffRequestId: created.id,
        employeeId: actor.employeeId,
        employeeName: created.employee.name,
        date: String(date).slice(0, 10),
        startTime,
        endTime,
        hours,
        offDay,
        reason: timeOffReasonLabel(reason),
        reasonDetail: reasonDetail ?? null,
      });
    } catch (err) {
      console.error("Failed to send time off approval email:", err);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating time off request:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
