import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { parseReportMonth } from "@/lib/leave-summary";
import { buildLeaveSummary } from "@/lib/leave-summary-report";

export const dynamic = "force-dynamic";

// GET /api/mobile/leave-summary?month=YYYY-MM — admin only.
// Monthly leave + MC summary of every active staff member and intern; same
// payload as /api/agent/leave-summary. `month` defaults to the current month (SGT).
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const param = new URL(req.url).searchParams.get("month");
  const currentMonthKey = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const month = parseReportMonth(param ?? currentMonthKey);
  if (!month) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });

  return NextResponse.json(await buildLeaveSummary(month));
}
