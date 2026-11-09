/**
 * Alerts for the finance agents (QuickBooks liveness, weekly bank reconciliation):
 * an in-app Notification for each recipient that has a User account, plus one email
 * via src/lib/send-email.ts. Both are best-effort and never throw.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";

/** Default recipients (Alfred Ang, Tan Soik Ching). Override with FINANCE_ALERT_EMAILS (comma-separated). */
export const DEFAULT_FINANCE_ALERT_EMAILS = ["angch@tertiaryinfotech.com", "tansc@tertiaryinfotech.com"];

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
    const users = await prisma.user.findMany({
      where: { email: { in: recipients, mode: "insensitive" } },
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
