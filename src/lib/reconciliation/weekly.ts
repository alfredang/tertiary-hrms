/**
 * Weekly bank reconciliation agent (/api/cron/bank-reconciliation, Monday 08:00 SGT):
 * reconciles the latest period, stores the run, and emails/notifies the finance admins.
 */
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/webhooks";
import { escapeHtml, financeEmailShell, sendFinanceAlert, type FinanceAlertResult } from "@/lib/finance-alerts";
import { createReconciliationRun, getRunDetail, latestPeriod, sgtTodayIso, type RunDetail } from "./service";

const fmtMoney = (v: string | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(Number(v)); // display only

export function buildReconciliationEmail(detail: RunDetail, link: string): { subject: string; html: string; message: string } {
  const { run, summary: s, items } = detail;
  const period = `${run.periodStart} to ${run.periodEnd}`;
  const unexplained = s.balances?.unexplainedDifference ?? null;
  const flag = s.unmatchedBankCount + s.unmatchedQbCount + s.mismatchCount > 0 || (unexplained !== null && unexplained !== "0.00");
  const subject = `[HRMS] Bank reconciliation ${period}: ${s.matchRate}% matched${flag ? `, ${s.unmatchedBankCount + s.unmatchedQbCount + s.mismatchCount} to review` : ""}`;
  const message =
    `${period} (${run.qbAccountName ?? "QuickBooks"}): ${s.matchRate}% of ${s.bankCount} statement rows matched. ` +
    `${s.unmatchedBankCount} unmatched in bank, ${s.unmatchedQbCount} unmatched in QuickBooks, ${s.mismatchCount} amount mismatches.` +
    (unexplained !== null ? ` Unexplained difference ${fmtMoney(unexplained)}.` : "");

  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:4px 0;text-align:right">${escapeHtml(v)}</td></tr>`;
  const top = (status: string, label: string) => {
    const list = items.filter((i) => i.status === status).slice(0, 10);
    if (!list.length) return "";
    return `<h3 style="margin:18px 0 6px;font-size:15px">${escapeHtml(label)}</h3><table style="border-collapse:collapse;font-size:13px;width:100%">${list
      .map((i) => {
        const date = i.bankDate ?? i.qbDate ?? "";
        const desc = i.bankDescription ?? [i.qbTxnType, i.qbPayee, i.qbDocNumber].filter(Boolean).join(" · ");
        const amt = i.bankAmount ?? i.qbAmount;
        const dir = (i.bankDirection ?? i.qbDirection) === "CREDIT" ? "in" : "out";
        const extra = i.status === "AMOUNT_MISMATCH" ? ` (QB ${fmtMoney(i.qbAmount)}, diff ${fmtMoney(i.amountDifference)})` : "";
        return `<tr><td style="padding:3px 8px 3px 0;white-space:nowrap">${escapeHtml(date)}</td><td style="padding:3px 8px">${escapeHtml(String(desc).slice(0, 90))}</td><td style="padding:3px 0;text-align:right;white-space:nowrap">${escapeHtml(fmtMoney(amt))} ${dir}${escapeHtml(extra)}</td></tr>`;
      })
      .join("")}</table>`;
  };

  const balances = s.balances
    ? row("Bank closing balance", fmtMoney(s.balances.bankClosingBalance)) +
      row("QuickBooks balance", fmtMoney(s.balances.qbClosingBalance)) +
      row("Adjusted bank balance", fmtMoney(s.balances.adjustedBankBalance)) +
      row("Adjusted QuickBooks balance", fmtMoney(s.balances.adjustedQbBalance)) +
      row("Unexplained difference", fmtMoney(s.balances.unexplainedDifference))
    : row("QuickBooks balance at period end", fmtMoney(run.qbClosingBalance)) +
      row("Bank closing balance", "not entered (add it on the reconciliation page)");

  const html = financeEmailShell(
    `Weekly bank reconciliation: ${period}`,
    `<p>${escapeHtml(message)}</p>
<table style="border-collapse:collapse;font-size:14px">
${row("Match rate", `${s.matchRate}%`)}
${row("Statement rows / QuickBooks rows", `${s.bankCount} / ${s.qbCount}`)}
${row("Matched", String(s.matchedCount))}
${row("Amount mismatches", String(s.mismatchCount))}
${row("Unmatched in bank (not in QuickBooks)", `${s.unmatchedBankCount} · in ${fmtMoney(s.reconciling.bankCreditsNotInQb)} / out ${fmtMoney(s.reconciling.bankDebitsNotInQb)}`)}
${row("Unmatched in QuickBooks (not on statement)", `${s.unmatchedQbCount} · in ${fmtMoney(s.reconciling.qbCreditsNotInBank)} / out ${fmtMoney(s.reconciling.qbDebitsNotInBank)}`)}
${row("Bank net movement", fmtMoney(s.netBankMovement))}
${row("QuickBooks net movement", fmtMoney(s.netQbMovement))}
${row("Movement difference", fmtMoney(s.movementDifference))}
${balances}
</table>
${run.warnings.length ? `<p style="color:#b45309;font-size:13px">Warnings: ${escapeHtml(run.warnings.join("; "))}</p>` : ""}
${top("UNMATCHED_BANK", "Unmatched in bank (first 10)")}
${top("UNMATCHED_QB", "Unmatched in QuickBooks (first 10)")}
${top("AMOUNT_MISMATCH", "Amount mismatches (first 10)")}`,
    link,
  );
  return { subject, html, message };
}

export interface WeeklyRunResult {
  runId: string | null;
  period: { start: string; end: string };
  summary: RunDetail["summary"] | null;
  alert: FinanceAlertResult | null;
  error?: string;
}

export async function runWeeklyReconciliation(opts: { month?: string | null; trigger: "SCHEDULED" | "MANUAL" }): Promise<WeeklyRunResult> {
  const latest = await prisma.bankTransaction.aggregate({ _max: { paymentDate: true } });
  const latestIso = latest._max.paymentDate ? latest._max.paymentDate.toISOString().slice(0, 10) : null;
  const period = latestPeriod(latestIso, sgtTodayIso(), opts.month);
  const base = getBaseUrl();

  let runId: string;
  try {
    runId = await createReconciliationRun({ periodStart: period.start, periodEnd: period.end, trigger: opts.trigger });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const alert = await sendFinanceAlert({
      title: "Weekly bank reconciliation FAILED",
      message: `${period.start} to ${period.end}: ${message}`,
      type: "BANK_RECONCILIATION",
      link: "/accounting/reconciliation",
      emailSubject: `[HRMS] Weekly bank reconciliation FAILED (${period.start} to ${period.end})`,
      emailHtml: financeEmailShell("Weekly bank reconciliation failed", `<p>${escapeHtml(message)}</p>`, `${base}/accounting/reconciliation`),
    });
    return { runId: null, period, summary: null, alert, error: message };
  }

  const detail = await getRunDetail(runId);
  if (!detail) return { runId, period, summary: null, alert: null, error: "Run not found after creation" };
  const email = buildReconciliationEmail(detail, `${base}/accounting/reconciliation?run=${runId}`);
  const alert = await sendFinanceAlert({
    title: `Bank reconciliation ${period.start} to ${period.end}`,
    message: email.message,
    type: "BANK_RECONCILIATION",
    link: `/accounting/reconciliation?run=${runId}`,
    emailSubject: email.subject,
    emailHtml: email.html,
  });
  return { runId, period, summary: detail.summary, alert };
}
