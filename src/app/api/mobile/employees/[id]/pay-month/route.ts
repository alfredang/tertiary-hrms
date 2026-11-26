import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { loadPayMonthSummary, monthKey, parseMonth } from "@/lib/pay-month-summary";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/employees/{id}/pay-month?month=YYYY-MM — the month picker on the apps' Team → person page
 * (Alfred, 26 Nov 2026: "easier for us to compute the payout"). Four figures for that month:
 * `annualLeaveDays`, `noPayLeaveDays`, `mcDays` with `mcLabel` ("No Pay MC" for interns, "Paid MC" for staff;
 * `mcPaid`), `paybackDays` (off days worked), plus `month` and `intern`. Same rule as the person's records:
 * approvers for anyone, everyone else only for themselves. Default month: the current one.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (id !== ctx.employeeId && !ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const now = new Date();
  const picked =
    parseMonth(new URL(req.url).searchParams.get("month")) ?? parseMonth(monthKey(now.getFullYear(), now.getMonth() + 1))!;
  const summary = await loadPayMonthSummary(id, picked.year, picked.month);
  if (!summary) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  return NextResponse.json(summary);
}
