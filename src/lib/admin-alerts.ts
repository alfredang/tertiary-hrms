import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";

/**
 * HRMS admin email routing (Alfred Ang, 11 Nov 2026). There are exactly two admins.
 * Every email meant for admins (alerts, leave/MC/NPL/expense/time-off approval
 * requests, finance alerts) goes TO Tan Soik Ching and CC Alfred Ang.
 */
export const ADMIN_EMAIL_TO = "tansc@tertiaryinfotech.com";
export const ADMIN_EMAIL_CC = "angch@tertiaryinfotech.com";

/** Both admins, To first. Override with HR_ALERT_EMAILS (comma-separated, first = To, rest = Cc). */
export const DEFAULT_ADMIN_ALERT_EMAILS = [ADMIN_EMAIL_TO, ADMIN_EMAIL_CC];

export function adminAlertEmails(): string[] {
  const env = process.env.HR_ALERT_EMAILS?.split(",").map((s) => s.trim()).filter(Boolean);
  return env && env.length > 0 ? env : DEFAULT_ADMIN_ALERT_EMAILS;
}

/** Split a recipient list into one To and the rest as Cc, deduped case-insensitively. */
export function toAndCc(list: string[]): { to: string; cc: string[] } {
  const seen = new Set<string>();
  const uniq = list.map((e) => e.trim()).filter((e) => e && !seen.has(e.toLowerCase()) && seen.add(e.toLowerCase()));
  return { to: uniq[0] ?? ADMIN_EMAIL_TO, cc: uniq.slice(1) };
}

/**
 * Every alert email sent to a staff member or intern (missed clock-in/out, timesheet
 * reminder) is CC'd to both admins. Override with HR_ALERT_CC (comma-separated).
 */
export const DEFAULT_STAFF_ALERT_CC = [ADMIN_EMAIL_TO, ADMIN_EMAIL_CC];

export function staffAlertCc(to: string): string[] {
  const env = process.env.HR_ALERT_CC?.split(",").map((s) => s.trim()).filter(Boolean);
  const list = env && env.length > 0 ? env : DEFAULT_STAFF_ALERT_CC;
  const recipient = to.trim().toLowerCase();
  return Array.from(new Set(list.map((e) => e.toLowerCase()))).filter((e) => e !== recipient);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * In-app notification per admin + one email (To Tan Soik Ching, Cc Alfred Ang). Best effort: failures are collected
 * and returned, never thrown, so a cron run still reports what it found.
 */
export async function notifyAdmins(args: {
  title: string;
  message: string;
  type: string;
  link: string;
  subject: string;
  html: string;
}): Promise<{ notified: number; emailed: number; errors: string[] }> {
  const emails = adminAlertEmails();
  const errors: string[] = [];
  let notified = 0;
  let emailed = 0;

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: { id: true },
    });
    if (users.length > 0) {
      const r = await prisma.notification.createMany({
        data: users.map((u) => ({ userId: u.id, title: args.title, message: args.message, type: args.type, link: args.link })),
      });
      notified = r.count;
    }
  } catch (err) {
    errors.push(`notification: ${err instanceof Error ? err.message : String(err)}`);
  }

  // One email: To the first admin (Tan Soik Ching), Cc the rest (Alfred Ang).
  const { to, cc } = toAndCc(emails);
  try {
    await sendEmail({ to, cc, subject: args.subject, html: args.html });
    emailed = 1 + cc.length;
  } catch (err) {
    errors.push(`email ${to}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { notified, emailed, errors };
}

/**
 * In-app notification (and so a phone push) to the HRMS admins when a staff member submits
 * something that needs approval: leave of any type incl. MC / NPL, time off, expense claims.
 * Admins = users holding the ADMIN role (Alfred Ang, Tan Soik Ching). Best effort, never throws.
 */
export async function notifyApprovers(args: { title: string; message: string; type: string; link: string }): Promise<number> {
  try {
    const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { id: true } });
    if (admins.length === 0) return 0;
    const r = await prisma.notification.createMany({
      data: admins.map((u) => ({ userId: u.id, title: args.title, message: args.message, type: args.type, link: args.link })),
    });
    return r.count;
  } catch (err) {
    console.error("[notifyApprovers]", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Cron bearer check shared by the HR cron routes. Returns a response on failure. */
export function cronAuthError(req: Request): { status: number; error: string } | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { status: 500, error: "CRON_SECRET not configured" };
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return { status: 401, error: "Unauthorized" };
  return null;
}

/** Today's date in Singapore as UTC midnight (matches @db.Date columns). */
export function sgtToday(now: Date = new Date()): Date {
  const key = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${key}T00:00:00.000Z`);
}
