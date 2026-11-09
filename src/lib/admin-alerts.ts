import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";

/**
 * Admins who receive HR alerts (missed punches, compliance findings): Alfred Ang
 * and Tan Soik Ching. Override with HR_ALERT_EMAILS (comma-separated) if needed.
 */
export const DEFAULT_ADMIN_ALERT_EMAILS = ["angch@tertiaryinfotech.com", "tansc@tertiaryinfotech.com"];

export function adminAlertEmails(): string[] {
  const env = process.env.HR_ALERT_EMAILS?.split(",").map((s) => s.trim()).filter(Boolean);
  return env && env.length > 0 ? env : DEFAULT_ADMIN_ALERT_EMAILS;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * In-app notification + one email per admin. Best effort: failures are collected
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

  for (const to of emails) {
    try {
      await sendEmail({ to, subject: args.subject, html: args.html });
      emailed++;
    } catch (err) {
      errors.push(`email ${to}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { notified, emailed, errors };
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
