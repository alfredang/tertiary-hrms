import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { approvalResultPage, type ResultSummary } from "@/lib/approval-result";
import { loadLeaveSummary } from "@/lib/approval-summaries";
import { sendPaybackDecisionEmail } from "@/lib/decision-email";
import { decidePayback } from "@/lib/npl-payback-store";
import { prettyDay } from "@/lib/npl-payback";

/** The staff member's leave summary, which carries the No Pay Leave balance (never throws). */
async function summaryFor(targetId: string): Promise<ResultSummary | null> {
  try {
    const p = await prisma.nplPayback.findUnique({ where: { id: targetId }, select: { employeeId: true, nplDate: true } });
    return p ? await loadLeaveSummary(p.employeeId, p.nplDate.getUTCFullYear()) : null;
  } catch {
    return null;
  }
}

// GET — the emailed Approve / Decline button acts on the click, with no confirm page (same as
// leave, expense and time off). The single-use, expiring token is the authorisation.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return decide(url.searchParams.get("token"), url.searchParams.get("action"));
}

// HEAD — link checkers probe with HEAD; never let that make a decision.
export async function HEAD() {
  return new Response(null, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function decide(token: string | null, action: string | null): Promise<Response> {
  if (!token || !action || (action !== "accept" && action !== "decline")) {
    return approvalResultPage({ tone: "error", title: "Invalid request", message: "The link is missing required parameters." });
  }

  const tokenRow = await prisma.approvalToken.findUnique({ where: { token } });
  if (!tokenRow || tokenRow.kind !== "NPL_PAYBACK") {
    return approvalResultPage({ tone: "error", title: "Invalid token", message: "This approval link is not recognised." });
  }
  if (tokenRow.consumedAt) {
    return approvalResultPage({
      tone: "info",
      title: "Already handled",
      message: `This request was already ${tokenRow.action === "accept" ? "approved" : "declined"} on ${tokenRow.consumedAt.toISOString().slice(0, 10)}.`,
      summary: await summaryFor(tokenRow.targetId),
    });
  }
  if (tokenRow.expiresAt < new Date()) {
    return approvalResultPage({ tone: "error", title: "Link expired", message: "This approval link has expired. Ask the employee to resubmit." });
  }

  const payback = await prisma.nplPayback.findUnique({
    where: { id: tokenRow.targetId },
    include: { employee: { select: { name: true } }, leaveRequest: { select: { status: true } } },
  });
  if (!payback) {
    return approvalResultPage({ tone: "error", title: "Not found", message: "The payback request no longer exists." });
  }
  if (payback.status !== "PENDING") {
    await prisma.approvalToken.update({ where: { token }, data: { action, consumedAt: new Date() } });
    return approvalResultPage({
      tone: "info",
      title: "Already processed",
      message: `This request is currently ${payback.status}. No further action required.`,
      summary: await summaryFor(tokenRow.targetId),
    });
  }
  if (action === "accept" && payback.leaveRequest.status !== "APPROVED") {
    return approvalResultPage({
      tone: "error",
      title: "Nothing to pay back",
      message: "The No Pay Leave this request pays back is no longer approved. You can decline the request instead.",
    });
  }

  const decision = action === "accept" ? "APPROVED" : "REJECTED";
  const claimed = await prisma.$transaction(async (tx) => {
    // Claim the token first so a double click (or a link prefetch racing the click) applies once.
    const tokenClaim = await tx.approvalToken.updateMany({ where: { token, consumedAt: null }, data: { action, consumedAt: new Date() } });
    if (tokenClaim.count === 0) return false;
    return decidePayback(payback.id, decision, {}, tx);
  });
  if (!claimed) {
    return approvalResultPage({
      tone: "info",
      title: "Already handled",
      message: "This request has just been handled. No further action required.",
      summary: await summaryFor(tokenRow.targetId),
    });
  }

  // To the requester, Cc both admins, with the leave summary (never throws).
  await sendPaybackDecisionEmail(payback.id, decision);

  return approvalResultPage({
    tone: action === "accept" ? "approved" : "declined",
    title: action === "accept" ? "Payback approved" : "Payback declined",
    message:
      `${payback.employee.name}'s No Pay Leave payback (worked ${prettyDay(payback.workDate)} for the No Pay Leave on ${prettyDay(payback.nplDate)}) has been ` +
      (action === "accept" ? "approved. That day no longer counts as No Pay Leave taken." : "declined. The No Pay Leave balance is unchanged."),
    summary: await summaryFor(payback.id),
  });
}
