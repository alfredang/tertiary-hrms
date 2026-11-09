import { NextRequest } from "next/server";
import { checkCronAuth, runLoggedCronJob } from "@/lib/cron-run-log";
import { runWeeklyReconciliation } from "@/lib/reconciliation/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly bank reconciliation (statement vs QuickBooks, read-only). Emails + notifies the finance admins.
 * Schedule (Monday 08:00 SGT = Monday 00:00 UTC): 0 0 * * 1
 * Header: Authorization: Bearer <CRON_SECRET>
 * Optional ?month=YYYY-MM reconciles that whole month instead of the latest period.
 */
export async function GET(req: NextRequest) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const month = req.nextUrl.searchParams.get("month");
  return runLoggedCronJob("weekly-bank-reconciliation", req, async (trigger) => {
    const r = await runWeeklyReconciliation({ month, trigger });
    const period = `${r.period.start} to ${r.period.end}`;
    if (!r.runId || !r.summary) {
      return { status: "FAILED", summary: `${period}: ${r.error ?? "failed"}`, details: { period: r.period, alert: r.alert } };
    }
    const s = r.summary;
    return {
      summary:
        `${period}: ${s.matchRate}% matched (${s.bankCount} statement rows), ${s.unmatchedBankCount} unmatched in bank, ` +
        `${s.unmatchedQbCount} unmatched in QB, ${s.mismatchCount} mismatches` +
        (r.alert ? ` · notified ${r.alert.notified}, email ${r.alert.emailed ? "sent" : "failed"}` : ""),
      details: { runId: r.runId, period: r.period, matchRate: s.matchRate, emailed: r.alert?.emailed ?? false },
    };
  });
}
