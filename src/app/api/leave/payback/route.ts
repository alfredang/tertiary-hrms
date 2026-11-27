import { linkWithRequest } from "@/lib/notification-relevance";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { isDemoEmployee } from "@/lib/demo-guard";
import { notifyApprovers } from "@/lib/admin-alerts";
import { sendPaybackApprovalEmail } from "@/lib/approval-email";
import { getNplStatus } from "@/lib/leave-allowance";
import { dateOnly, paybackNoticeMessage, paybackProblem, PAYBACK_NOTICE_TITLE } from "@/lib/npl-payback";
import { getNplDays, holidayKeys, workDateUsage } from "@/lib/npl-payback-store";

export const dynamic = "force-dynamic";

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
  return { employeeId: session.user.employeeId, isAdmin: hasAdminAccess(session.user.role) };
}

// GET /api/leave/payback — own paybacks; admins see everyone's.
export async function GET() {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.nplPayback.findMany({
    where: actor.isAdmin ? {} : { employeeId: actor.employeeId ?? "__none__" },
    include: { employee: { select: { id: true, name: true } }, approver: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json(rows);
}

// POST /api/leave/payback — the signed-in staff member or intern asks to pay back one No Pay
// Leave day with an off day they worked.
export async function POST(req: Request) {
  try {
    const actor = await resolveActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.employeeId) {
      return NextResponse.json({ error: "No employee record linked to this account" }, { status: 400 });
    }
    const employeeId = actor.employeeId;

    const body = await req.json().catch(() => ({}));
    const nplDate = String(body?.nplDate ?? "").slice(0, 10);
    const workDate = String(body?.workDate ?? "").slice(0, 10);
    const days = Number(body?.days ?? 1);
    const note: string | null = String(body?.note ?? "").trim().slice(0, 500) || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nplDate) || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json({ error: "Choose the No Pay Leave day and the off day you worked." }, { status: 400 });
    }

    const year = Number(nplDate.slice(0, 4));
    const [employee, nplDays, holidays, usage] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, workdays: true } }),
      getNplDays(employeeId, year),
      holidayKeys([year]),
      workDateUsage(employeeId, workDate),
    ]);
    const nplDay = nplDays.find((d) => d.date === nplDate);
    if (nplDay?.alPending) {
      return NextResponse.json({ error: "Annual leave for this No Pay Leave day is waiting for approval." }, { status: 400 });
    }
    const problem = paybackProblem({
      days,
      nplDay,
      alreadyClaimed: nplDay ? nplDay.paidBack + nplDay.pending : 0,
      workDate,
      workdays: employee?.workdays,
      holidays,
      workDateClaimed: usage.claimed,
      offInLieuOnWorkDate: usage.offInLieu,
    });
    if (problem || !nplDay) return NextResponse.json({ error: problem ?? "Invalid request" }, { status: 400 });

    const created = await prisma.nplPayback.create({
      data: {
        employeeId,
        leaveRequestId: nplDay.leaveRequestId,
        nplDate: dateOnly(nplDate),
        workDate: dateOnly(workDate),
        days,
        note,
        status: "PENDING",
      },
    });

    const name = employee?.name ?? "Staff";
    if (!(await isDemoEmployee(employeeId))) {
      await notifyApprovers({
        title: PAYBACK_NOTICE_TITLE,
        message: paybackNoticeMessage(name, workDate, nplDate, days),
        type: "PAYBACK_SUBMITTED",
        link: linkWithRequest("/leave/payback", created.id),
      });
    }

    try {
      const npl = await getNplStatus(employeeId).catch(() => null);
      await sendPaybackApprovalEmail({
        paybackId: created.id,
        employeeId,
        employeeName: name,
        nplDate,
        workDate,
        days,
        note,
        balanceChange: npl ? `${npl.remaining} of ${npl.cap} left → ${Math.min(npl.cap, npl.remaining + days)} of ${npl.cap} left` : null,
      });
    } catch (err) {
      console.error("Failed to send payback approval email:", err);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating No Pay Leave payback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
