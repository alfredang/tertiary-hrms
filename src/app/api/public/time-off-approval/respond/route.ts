import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { approvalResultPage, type ResultSummary } from "@/lib/approval-result";
import { loadTimeOffSummary } from "@/lib/approval-summaries";
import { sendTimeOffDecisionEmail } from "@/lib/decision-email";
import { timeOffReasonLabel } from "@/lib/time-off";

function htmlResponse(tone: "error" | "info", title: string, message: string, summary?: ResultSummary | null) {
  return approvalResultPage({ tone, title, message, summary });
}

/** Year-to-date summary for the staff member behind this request (never throws). */
async function summaryFor(targetId: string): Promise<ResultSummary | null> {
  try {
    const t = await prisma.timeOffRequest.findUnique({ where: { id: targetId }, select: { employeeId: true, date: true } });
    return t ? await loadTimeOffSummary(t.employeeId, t.date) : null;
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
  if (!tokenRow || tokenRow.kind !== "TIME_OFF") {
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

  const request = await prisma.timeOffRequest.findUnique({
    where: { id: tokenRow.targetId },
    include: {
      employee: { include: { user: { select: { email: true } } } },
    },
  });
  if (!request) {
    return htmlResponse("error", "Not found", "The time off request no longer exists.");
  }
  if (request.status !== "PENDING") {
    await prisma.approvalToken.update({
      where: { token },
      data: { action, consumedAt: new Date() },
    });
    return htmlResponse(
      "info",
      "Already processed",
      `This request is currently ${request.status}. No further action required.`,
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
    await tx.timeOffRequest.update({
      where: { id: request.id },
      data: {
        status: newStatus,
        approverId: null,
        ...(action === "accept" ? { approvedAt: now } : { rejectedAt: now }),
      },
    });
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
  await sendTimeOffDecisionEmail(request.id, action === "accept" ? "APPROVED" : "REJECTED");

  const dateDisplay = new Date(`${request.date.toISOString().slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const reasonLabel = timeOffReasonLabel(request.reason);

  return approvalResultPage({
    tone: action === "accept" ? "approved" : "declined",
    title: action === "accept" ? "Time off approved" : "Time off declined",
    message: `${request.employee.name}'s time off request on ${dateDisplay} (${reasonLabel}) has been ${action === "accept" ? "approved" : "declined"}.`,
    summary: await summaryFor(request.id),
  });
}
