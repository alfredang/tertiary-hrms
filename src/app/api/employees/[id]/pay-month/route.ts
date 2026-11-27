import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { loadPayMonthSummary, monthKey, parseMonth } from "@/lib/pay-month-summary";

export const dynamic = "force-dynamic";

/**
 * GET /api/employees/{id}/pay-month?month=YYYY-MM — the four figures for working out one person's pay
 * that month (Alfred, 26 Nov 2026): Annual Leave, No Pay Leave, No Pay MC (interns) or Paid MC (staff), Payback (`pay-month-summary.ts`).
 * Approvers and accountants for anyone; everyone else only for themselves. Default month: the current one.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const roles: string[] = session.user.roles ?? [session.user.role];
    const canSeeAnyone = hasAdminAccess(session.user.role) || roles.includes("ACCOUNTANT");
    if (!canSeeAnyone && session.user.employeeId !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const now = new Date();
  const picked = parseMonth(req.nextUrl.searchParams.get("month")) ?? parseMonth(monthKey(now.getFullYear(), now.getMonth() + 1))!;
  const summary = await loadPayMonthSummary(id, picked.year, picked.month);
  if (!summary) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  return NextResponse.json(summary);
}
