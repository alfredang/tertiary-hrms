import { NextRequest } from "next/server";
import { checkCronAuth, runLoggedCronJob } from "@/lib/cron-run-log";
import { runQuickBooksHealthCheck } from "@/lib/quickbooks/health";
import { notifyAccountantsToClear } from "@/lib/finance-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * QuickBooks liveness monitor (read-only), then the accountants' daily "Finance to clear" notice. Daily via Coolify cron, or Settings → Cron Jobs → Run Now.
 * Schedule (07:00 SGT = 23:00 UTC): 0 23 * * *
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  return runLoggedCronJob("quickbooks-health", req, async (trigger) => {
    const r = await runQuickBooksHealthCheck({ trigger });
    // Accountants: what is left to clear today (claims, bank expenses, reconciliation lines).
    const toClear = await notifyAccountantsToClear();
    const expiry = r.daysToRefreshExpiry !== null ? `, refresh token ${r.daysToRefreshExpiry}d left` : "";
    return {
      // The monitor ran fine but found QuickBooks down: log FAILED so it stands out in Settings.
      status: r.status === "FAIL" ? "FAILED" : "SUCCESS",
      summary: `${r.status} (${r.mode}${r.latencyMs !== null ? `, ${r.latencyMs} ms` : ""}${expiry})${r.alerted ? " · admins alerted" : ""}: ${r.message}`
        + (toClear.notified ? ` · ${toClear.notified} accountant(s) told: ${toClear.message}` : ""),
      details: { health: r, toClear },
      httpStatus: 200,
    };
  });
}
