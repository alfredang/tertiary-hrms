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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

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
    );
  }

  const newStatus = action === "accept" ? "APPROVED" : "REJECTED";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.expenseClaim.update({
      where: { id: claim.id },
      data: {
        status: newStatus,
        approvedAt: action === "accept" ? now : null,
        rejectedAt: action === "decline" ? now : null,
      },
    });
    await tx.approvalToken.update({
      where: { token },
      data: { action, consumedAt: now },
    });
  });

  try {
    const staffEmail = claim.employee.user?.email || claim.employee.email;
    if (staffEmail) {
      await sendDecisionEmailToStaff({
        templateKey: action === "accept" ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED",
        staffEmail,
        vars: {
          EMPLOYEE_NAME: claim.employee.name,
          CATEGORY: claim.category.name,
          AMOUNT: Number(claim.amount).toFixed(2),
          EXPENSE_DATE: claim.expenseDate.toISOString().slice(0, 10),
          DESCRIPTION: claim.description,
        },
      });
    }
  } catch (err) {
    console.error(`Failed to notify staff for expense ${claim.id}:`, err);
  }

  return htmlResponse(
    "success",
    action === "accept" ? "Claim approved" : "Claim declined",
    `${claim.employee.name}'s ${claim.category.name} claim of $${Number(claim.amount).toFixed(2)} has been ${action === "accept" ? "approved" : "declined"}.`,
  );
}
