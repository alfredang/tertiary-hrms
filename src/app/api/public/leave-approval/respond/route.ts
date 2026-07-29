import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDecisionEmailToStaff } from "@/lib/approval-email";

function htmlResponse(status: "success" | "error" | "info", title: string, message: string) {
  const color = status === "success" ? "#16a34a" : status === "error" ? "#dc2626" : "#2563eb";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #0b0f1a; color: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
  .card { max-width: 480px; width: 100%; background: #131a2b; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; text-align: center; }
  h1 { color: ${color}; margin: 0 0 12px; font-size: 22px; }
  p { color: #d1d5db; line-height: 1.55; margin: 8px 0; }
</style>
</head><body>
<div class="card"><h1>${title}</h1><p>${message}</p></div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function htmlConfirm(opts: {
  token: string;
  action: "accept" | "decline";
  employeeName: string;
  rows: Array<{ label: string; value: string }>;
  postUrl: string;
}): Response {
  const { token, action, employeeName, rows, postUrl } = opts;
  const isApprove = action === "accept";
  const actionLabel = isApprove ? "Approve" : "Decline";
  const actionColor = isApprove ? "#16A34A" : "#DC2626";
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;font-size:14px;color:#6B7280;width:110px;border-bottom:1px solid #1f2937;">${r.label}</td><td style="padding:8px 12px;font-size:14px;color:#F1F5F9;font-weight:500;border-bottom:1px solid #1f2937;">${r.value}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${actionLabel} Leave Request</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #0b0f1a; color: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
  .card { max-width: 480px; width: 100%; background: #131a2b; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; }
  h1 { color: #f5f5f5; margin: 0 0 4px; font-size: 20px; text-align: center; }
  .sub { color: #9CA3AF; font-size: 14px; text-align: center; margin: 0 0 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .buttons { display: flex; gap: 12px; justify-content: center; }
  .btn { padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; font-family: Arial; }
  .btn-action { background: ${actionColor}; color: #fff; }
  .btn-cancel { background: #374151; color: #D1D5DB; text-decoration: none; display: inline-block; }
</style>
</head><body>
<div class="card">
  <h1>${actionLabel} Leave Request?</h1>
  <p class="sub">${employeeName}</p>
  <table>${rowsHtml}</table>
  <form method="POST" action="${postUrl}">
    <input type="hidden" name="token" value="${token}">
    <input type="hidden" name="action" value="${action}">
    <div class="buttons">
      <a href="javascript:history.back()" class="btn btn-cancel">Cancel</a>
      <button type="submit" class="btn btn-action">Confirm ${actionLabel}</button>
    </div>
  </form>
</div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// GET — show confirmation page only; no state changes (prevents email scanner auto-approval)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || !action || (action !== "accept" && action !== "decline")) {
    return htmlResponse("error", "Invalid request", "The link is missing required parameters.");
  }

  const tokenRow = await prisma.approvalToken.findUnique({ where: { token } });
  if (!tokenRow || tokenRow.kind !== "LEAVE") {
    return htmlResponse("error", "Invalid token", "This approval link is not recognised.");
  }
  if (tokenRow.consumedAt) {
    return htmlResponse(
      "info",
      "Already handled",
      `This request was already ${tokenRow.action === "accept" ? "approved" : "declined"} on ${tokenRow.consumedAt.toISOString().slice(0, 10)}.`,
    );
  }
  if (tokenRow.expiresAt < new Date()) {
    return htmlResponse("error", "Link expired", "This approval link has expired. Ask the employee to resubmit.");
  }

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: tokenRow.targetId },
    include: {
      employee: { select: { name: true } },
      leaveType: true,
    },
  });
  if (!leave) {
    return htmlResponse("error", "Not found", "The leave request no longer exists.");
  }
  if (leave.status !== "PENDING") {
    return htmlResponse(
      "info",
      "Already processed",
      `This request is currently ${leave.status}. No further action required.`,
    );
  }

  const rows = [
    { label: "Leave Type", value: leave.leaveType.name },
    {
      label: "Period",
      value: `${leave.startDate.toISOString().slice(0, 10)} – ${leave.endDate.toISOString().slice(0, 10)}`,
    },
    { label: "Duration", value: `${Number(leave.days)} day(s)` },
    ...(leave.reason ? [{ label: "Reason", value: leave.reason }] : []),
  ];

  return htmlConfirm({
    token,
    action,
    employeeName: leave.employee.name,
    rows,
    postUrl: "/api/public/leave-approval/respond",
  });
}

// POST — perform the actual approval/decline after admin confirms on the page
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const token = formData.get("token") as string | null;
  const action = formData.get("action") as string | null;

  if (!token || !action || (action !== "accept" && action !== "decline")) {
    return htmlResponse("error", "Invalid request", "The form is missing required fields.");
  }

  const tokenRow = await prisma.approvalToken.findUnique({ where: { token } });
  if (!tokenRow || tokenRow.kind !== "LEAVE") {
    return htmlResponse("error", "Invalid token", "This approval link is not recognised.");
  }
  if (tokenRow.consumedAt) {
    return htmlResponse(
      "info",
      "Already handled",
      `This request was already ${tokenRow.action === "accept" ? "approved" : "declined"} on ${tokenRow.consumedAt.toISOString().slice(0, 10)}.`,
    );
  }
  if (tokenRow.expiresAt < new Date()) {
    return htmlResponse("error", "Link expired", "This approval link has expired. Ask the employee to resubmit.");
  }

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: tokenRow.targetId },
    include: {
      employee: { include: { user: { select: { email: true } } } },
      leaveType: true,
    },
  });
  if (!leave) {
    return htmlResponse("error", "Not found", "The leave request no longer exists.");
  }
  if (leave.status !== "PENDING") {
    await prisma.approvalToken.update({
      where: { token },
      data: { action, consumedAt: new Date() },
    });
    return htmlResponse(
      "info",
      "Already processed",
      `This request is currently ${leave.status}. No further action required.`,
    );
  }

  const newStatus = action === "accept" ? "APPROVED" : "REJECTED";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: newStatus,
        approvedAt: action === "accept" ? now : null,
        rejectedAt: action === "decline" ? now : null,
      },
    });

    const currentYear = leave.startDate.getFullYear();
    if (action === "accept") {
      await tx.leaveBalance.updateMany({
        where: { employeeId: leave.employeeId, leaveTypeId: leave.leaveTypeId, year: currentYear },
        data: {
          used: { increment: Number(leave.days) },
          pending: { decrement: Number(leave.days) },
        },
      });

      try {
        await tx.calendarEvent.upsert({
          where: { leaveRequestId: leave.id },
          create: {
            title: `${leave.employee.name} — ${leave.leaveType.name}`,
            description: leave.reason || undefined,
            startDate: leave.startDate,
            endDate: leave.endDate,
            allDay: true,
            type: "LEAVE",
            color: "#f59e0b",
            leaveRequestId: leave.id,
          },
          update: {
            title: `${leave.employee.name} — ${leave.leaveType.name}`,
            description: leave.reason || undefined,
            startDate: leave.startDate,
            endDate: leave.endDate,
          },
        });
      } catch (err) {
        console.error(`Failed to create calendar event for leave ${leave.id}:`, err);
      }
    } else {
      await tx.leaveBalance.updateMany({
        where: { employeeId: leave.employeeId, leaveTypeId: leave.leaveTypeId, year: currentYear },
        data: { pending: { decrement: Number(leave.days) } },
      });
    }

    await tx.approvalToken.update({
      where: { token },
      data: { action, consumedAt: now },
    });
  });

  try {
    const staffEmail = leave.employee.user?.email || leave.employee.email;
    if (staffEmail) {
      await sendDecisionEmailToStaff({
        templateKey: action === "accept" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        staffEmail,
        vars: {
          EMPLOYEE_NAME: leave.employee.name,
          LEAVE_TYPE: leave.leaveType.name,
          START_DATE: leave.startDate.toISOString().slice(0, 10),
          END_DATE: leave.endDate.toISOString().slice(0, 10),
          DAYS: String(Number(leave.days)),
          APPROVER_NAME: "HR",
        },
      });
    }
  } catch (err) {
    console.error(`Failed to notify staff for leave ${leave.id}:`, err);
  }

  return htmlResponse(
    "success",
    action === "accept" ? "Leave approved" : "Leave declined",
    `${leave.employee.name}'s ${leave.leaveType.name} request (${leave.startDate.toISOString().slice(0, 10)} to ${leave.endDate.toISOString().slice(0, 10)}) has been ${action === "accept" ? "approved" : "declined"}.`,
  );
}
