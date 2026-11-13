import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { approvalResultPage, type ResultSummary } from "@/lib/approval-result";
import { loadLeaveSummary } from "@/lib/approval-summaries";
import { sendLeaveDecisionEmail } from "@/lib/decision-email";

function htmlResponse(tone: "error" | "info", title: string, message: string, summary?: ResultSummary | null) {
  return approvalResultPage({ tone, title, message, summary });
}

/** Year-to-date summary for the staff member behind this request (never throws). */
async function summaryFor(targetId: string): Promise<ResultSummary | null> {
  try {
    const t = await prisma.leaveRequest.findUnique({ where: { id: targetId }, select: { employeeId: true, startDate: true } });
    return t ? await loadLeaveSummary(t.employeeId, t.startDate.getUTCFullYear()) : null;
  } catch {
    return null;
  }
}

// GET — the emailed Approve/Decline button acts immediately, with no confirm page (same as the
// ai-mms newsletter/blog review links). The single-use, expiring token is the authorisation; a
// second click lands on "Already handled".
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return decide(url.searchParams.get("token"), url.searchParams.get("action"));
}

// HEAD — link checkers probe with HEAD; never let that make a decision.
export async function HEAD() {
  return new Response(null, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// POST — still accepted for confirmation pages opened before the one-click change.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  return decide(formData.get("token") as string | null, formData.get("action") as string | null);
}

async function decide(token: string | null, action: string | null): Promise<Response> {
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
      await summaryFor(tokenRow.targetId),
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
      await summaryFor(tokenRow.targetId),
    );
  }

  const newStatus = action === "accept" ? "APPROVED" : "REJECTED";
  const now = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    // Claim the token first: a double click (or a link prefetch racing the click) waits on this
    // row lock, then finds it consumed, so the decision and balance change apply exactly once.
    const tokenClaim = await tx.approvalToken.updateMany({
      where: { token, consumedAt: null },
      data: { action, consumedAt: now },
    });
    if (tokenClaim.count === 0) return false;
    await tx.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: newStatus,
        approvedAt: action === "accept" ? now : null,
        rejectedAt: action === "decline" ? now : null,
      },
    });

    const currentYear = leave.balanceYear ?? leave.startDate.getFullYear();
    if (action === "accept") {
      await tx.leaveBalance.updateMany({
        where: { employeeId: leave.employeeId, leaveTypeId: leave.leaveTypeId, year: currentYear },
        data: {
          used: { increment: Number(leave.balanceDays ?? leave.days) },
          pending: { decrement: Number(leave.balanceDays ?? leave.days) },
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
        data: { pending: { decrement: Number(leave.balanceDays ?? leave.days) } },
      });
    }

    // Contract AL reserves Off In Lieu separately from the actual AL debit.
    if (leave.balanceDays != null && Number(leave.otDaysUsed) > 0) {
      await tx.leaveBalance.updateMany({
        where: { employeeId: leave.employeeId, leaveType: { code: "AL_OT" }, year: leave.createdAt.getFullYear() },
        data: { pending: { decrement: Number(leave.otDaysUsed) },
          ...(action === "accept" ? { used: { increment: Number(leave.otDaysUsed) } } : {}) },
      });
    }

    return true;
  });
  if (!claimed) {
    return htmlResponse(
      "info",
      "Already handled",
      "This request has just been handled. No further action required.",
      await summaryFor(tokenRow.targetId),
    );
  }

  // To the requester, Cc both admins, with the year-to-date summary (never throws).
  await sendLeaveDecisionEmail(leave.id, action === "accept" ? "APPROVED" : "REJECTED");

  return approvalResultPage({
    tone: action === "accept" ? "approved" : "declined",
    title: action === "accept" ? "Leave approved" : "Leave declined",
    message: `${leave.employee.name}'s ${leave.leaveType.name} request (${leave.startDate.toISOString().slice(0, 10)} to ${leave.endDate.toISOString().slice(0, 10)}) has been ${action === "accept" ? "approved" : "declined"}.`,
    summary: await summaryFor(leave.id),
  });
}
