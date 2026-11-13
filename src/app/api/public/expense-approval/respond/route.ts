import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { approvalResultPage, type ResultSummary } from "@/lib/approval-result";
import { loadExpenseSummary } from "@/lib/approval-summaries";
import { sendExpenseDecisionEmail } from "@/lib/decision-email";

function htmlResponse(tone: "error" | "info", title: string, message: string, summary?: ResultSummary | null) {
  return approvalResultPage({ tone, title, message, summary });
}

/** Year-to-date summary for the staff member behind this request (never throws). */
async function summaryFor(targetId: string): Promise<ResultSummary | null> {
  try {
    const t = await prisma.expenseClaim.findUnique({ where: { id: targetId }, select: { employeeId: true, expenseDate: true } });
    return t ? await loadExpenseSummary(t.employeeId, t.expenseDate.getUTCFullYear()) : null;
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
  if (!tokenRow || tokenRow.kind !== "EXPENSE") {
    return htmlResponse("error", "Invalid token", "This approval link is not recognised.");
  }
  if (tokenRow.consumedAt) {
    return htmlResponse(
      "info",
      "Already handled",
      `This claim was already ${tokenRow.action === "accept" ? "approved" : "declined"} on ${tokenRow.consumedAt.toISOString().slice(0, 10)}.`,
      await summaryFor(tokenRow.targetId),
    );
  }
  if (tokenRow.expiresAt < new Date()) {
    return htmlResponse("error", "Link expired", "This approval link has expired. Ask the employee to resubmit.");
  }

  const claim = await prisma.expenseClaim.findUnique({
    where: { id: tokenRow.targetId },
    include: {
      employee: { include: { user: { select: { email: true } } } },
      category: true,
    },
  });
  if (!claim) {
    return htmlResponse("error", "Not found", "The expense claim no longer exists.");
  }
  if (claim.status !== "PENDING") {
    await prisma.approvalToken.update({
      where: { token },
      data: { action, consumedAt: new Date() },
    });
    return htmlResponse(
      "info",
      "Already processed",
      `This claim is currently ${claim.status}. No further action required.`,
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
    await tx.expenseClaim.update({
      where: { id: claim.id },
      data: {
        status: newStatus,
        approvedAt: action === "accept" ? now : null,
        rejectedAt: action === "decline" ? now : null,
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
  await sendExpenseDecisionEmail(claim.id, action === "accept" ? "APPROVED" : "REJECTED");

  return approvalResultPage({
    tone: action === "accept" ? "approved" : "declined",
    title: action === "accept" ? "Claim approved" : "Claim declined",
    message: `${claim.employee.name}'s ${claim.category.name} claim of $${Number(claim.amount).toFixed(2)} has been ${action === "accept" ? "approved" : "declined"}.`,
    summary: await summaryFor(claim.id),
  });
}
