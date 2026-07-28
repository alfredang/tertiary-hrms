import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { computeTimeOffHours, timeOffReasonLabel } from "@/lib/time-off";
import { sendTimeOffApprovalEmail } from "@/lib/approval-email";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import type { TimeOffReason } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_REASONS: TimeOffReason[] = ["EXAMS", "EMERGENCY", "OTHERS"];

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

  return NextResponse.json(requests);
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
    const { date, startTime, endTime, reason } = body ?? {};
    const reasonDetail: string | undefined = body?.reasonDetail?.trim() || undefined;

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

    const hours = computeTimeOffHours(startTime, endTime);
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

    // Reject an overlapping request on the same day (pending or approved).
    const sameDay = await prisma.timeOffRequest.findMany({
      where: {
        employeeId: actor.employeeId,
        date: requestDate,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { startTime: true, endTime: true },
    });

    const overlaps = sameDay.some((r) => startTime < r.endTime && endTime > r.startTime);
    if (overlaps) {
      return NextResponse.json(
        { error: "You already have a time off request covering part of that time." },
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

    // Notify approvers (best effort — never block the submission).
    try {
      const approvers = await prisma.user.findMany({
        where: { roles: { hasSome: ["ADMIN", "HR", "MANAGER"] } },
        select: { id: true },
      });
      const detail = reasonDetail ? ` — ${reasonDetail}` : "";
      await prisma.notification.createMany({
        data: approvers.map((u) => ({
          userId: u.id,
          title: "New Time Off Request",
          message: `${created.employee.name} requested ${hours}h time off on ${String(date).slice(0, 10)} (${timeOffReasonLabel(reason)})${detail}.`,
          type: "TIME_OFF_SUBMITTED",
          link: "/time-off",
        })),
        skipDuplicates: true,
      });
    } catch {
      // Non-critical
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
