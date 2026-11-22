/**
 * Alerts for the finance agents (QuickBooks liveness, weekly bank reconciliation):
 * an in-app Notification for each recipient that has a User account, plus one email
 * via src/lib/send-email.ts. Both are best-effort and never throw.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";

/** Default recipients: To Tan Soik Ching, Cc Alfred Ang. Override with FINANCE_ALERT_EMAILS (comma-separated, first = To). */
export const DEFAULT_FINANCE_ALERT_EMAILS = ["tansc@tertiaryinfotech.com", "angch@tertiaryinfotech.com"];

export function financeAlertRecipients(): string[] {
  const env = process.env.FINANCE_ALERT_EMAILS;
  const list = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_FINANCE_ALERT_EMAILS;
  return Array.from(new Set(list.map((e) => e.toLowerCase())));
}

export interface FinanceAlert {
  title: string;
  message: string;
  /** Notification.type, e.g. QUICKBOOKS_HEALTH or BANK_RECONCILIATION */
  type: string;
  link: string;
  emailSubject: string;
  emailHtml: string;
}

export interface FinanceAlertResult {
  notified: number;
  emailed: boolean;
  recipients: string[];
  emailError?: string;
}

export async function sendFinanceAlert(alert: FinanceAlert): Promise<FinanceAlertResult> {
  const recipients = financeAlertRecipients();
  let notified = 0;
  try {
    // The alert recipients plus every accountant (role ACCOUNTANT), in-app and on the phone (22 Nov 2026).
    const users = await prisma.user.findMany({
      where: { OR: [{ email: { in: recipients, mode: "insensitive" } }, { roles: { has: "ACCOUNTANT" } }] },
      select: { id: true },
    });
    if (users.length) {
      const res = await prisma.notification.createMany({
        data: users.map((u) => ({ userId: u.id, title: alert.title, message: alert.message.slice(0, 1000), type: alert.type, link: alert.link })),
      });
      notified = res.count;
    }
  } catch (err) {
    console.error("[finance-alerts] notification failed:", err instanceof Error ? err.message : err);
  }

  let emailed = false;
  let emailError: string | undefined;
  if (recipients.length) {
    try {
      await sendEmail({ to: recipients[0], cc: recipients.slice(1), subject: alert.emailSubject, html: alert.emailHtml });
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[finance-alerts] email failed:", emailError);
    }
  }
  return { notified, emailed, recipients, emailError };
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal shared email shell. */
export function financeEmailShell(heading: string, bodyHtml: string, link: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;max-width:680px;margin:0 auto;padding:16px">
<h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
${bodyHtml}
<p style="margin-top:20px"><a href="${escapeHtml(link)}" style="background:#2563eb;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open in HRMS</a></p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">Automated message from the HRMS finance agents. QuickBooks is accessed read-only.</p>
</body></html>`;
}

/** What an accountant still has to clear (the daily "Finance to clear" alert). */
export interface FinanceToClear {
  claimsPending: number;
  claimsToPay: number;
  debitsNotInQuickBooks: number;
  reconciliationToReview: number;
}

export async function financeToClear(): Promise<FinanceToClear> {
  const lastRun = await prisma.bankReconciliation.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const [claimsPending, claimsToPay, debitsNotInQuickBooks, reconciliationToReview] = await Promise.all([
    prisma.expenseClaim.count({ where: { status: "PENDING" } }),
    prisma.expenseClaim.count({ where: { status: "APPROVED" } }),
    // Bank debits (expenses) not yet created in QuickBooks or settled.
    prisma.bankTransaction.count({ where: { direction: "DEBIT", status: { notIn: ["QB Created", "Settled"] } } }),
    lastRun
      ? prisma.bankReconciliationItem.count({ where: { reconciliationId: lastRun.id, status: { not: "MATCHED" }, reviewed: false } })
      : Promise.resolve(0),
  ]);
  return { claimsPending, claimsToPay, debitsNotInQuickBooks, reconciliationToReview };
}

export function financeToClearMessage(t: FinanceToClear): string | null {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    t.reconciliationToReview > 0 && `${plural(t.reconciliationToReview, "bank reconciliation line", "bank reconciliation lines")} to review`,
    t.debitsNotInQuickBooks > 0 && `${plural(t.debitsNotInQuickBooks, "bank expense", "bank expenses")} not yet in QuickBooks`,
    t.claimsToPay > 0 && `${plural(t.claimsToPay, "approved claim", "approved claims")} to pay`,
    t.claimsPending > 0 && `${plural(t.claimsPending, "claim", "claims")} waiting for approval`,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") + "." : null;
}

/**
 * Daily (with the 07:00 QuickBooks check): one "Finance to clear" notice to each accountant when
 * anything is outstanding. In-app + phone push only, no email. Best effort, never throws.
 */
export async function notifyAccountantsToClear(): Promise<{ notified: number; message: string | null }> {
  try {
    const t = await financeToClear();
    const message = financeToClearMessage(t);
    if (!message) return { notified: 0, message: null };
    const users = await prisma.user.findMany({ where: { roles: { has: "ACCOUNTANT" } }, select: { id: true } });
    if (!users.length) return { notified: 0, message };
    const link = t.reconciliationToReview > 0 ? "/accounting/reconciliation"
      : t.debitsNotInQuickBooks > 0 ? "/accounting/expense-tracking" : "/expenses";
    const r = await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title: "Finance to clear", message, type: "FINANCE_TO_CLEAR", link })),
    });
    return { notified: r.count, message };
  } catch (err) {
    console.error("[finance-alerts] to-clear failed:", err instanceof Error ? err.message : err);
    return { notified: 0, message: null };
  }
}
