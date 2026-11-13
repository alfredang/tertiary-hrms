import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { sendEmail, type EmailAttachment } from "@/lib/send-email";
import { renderEmail } from "@/lib/email-templates/render";
import { getCompanyBranding } from "@/lib/company-settings";
import { generateEndpointToken, getBaseUrl } from "@/lib/webhooks";

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function attachmentFromLocalUrl(
  url: string | null | undefined,
  preferredName?: string | null,
): Promise<EmailAttachment | null> {
  if (!url) return null;
  const prefix = "/api/uploads/";
  if (!url.startsWith(prefix)) return null;
  try {
    const uniqueName = url.slice(prefix.length);
    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, uniqueName);
    const buffer = await readFile(filePath);
    const ext = path.extname(uniqueName).toLowerCase();
    const contentType = EXTENSION_TO_MIME[ext] || "application/octet-stream";
    const filename = preferredName?.trim() || uniqueName;
    return { filename, content: buffer, contentType };
  } catch (err) {
    console.error(`Could not attach ${url}:`, err);
    return null;
  }
}

import { isDemoEmail, isDemoEmployee } from "./demo-guard";
import { ADMIN_EMAIL_CC, ADMIN_EMAIL_TO } from "./admin-alerts";

const APPROVAL_TOKEN_TTL_DAYS = 14;

/**
 * Leave (AL, MC, NPL, every type), expense and time-off approval requests go TO Tan Soik
 * Ching and CC Alfred Ang, the two HRMS admins (Alfred, 11 Nov 2026). Addresses added in
 * Settings → Company → Approval emails are CC'd as well.
 */
async function getApproverEmails(): Promise<{ to: string[]; cc: string[] }> {
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
    select: { approvalEmails: true },
  });
  const cc = [ADMIN_EMAIL_CC, ...(settings?.approvalEmails ?? [])]
    .map((e) => e.trim().toLowerCase())
    .filter((e, i, all) => e && e !== ADMIN_EMAIL_TO && all.indexOf(e) === i);
  return { to: [ADMIN_EMAIL_TO], cc };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type RowStyle = "accent" | "bold" | "pill";

function buildNotificationEmailHtml(opts: {
  companyName: string;
  headerTitle: string;
  employeeName: string;
  introAction: string;
  rows: Array<{ label: string; value: string; style?: RowStyle }>;
  ctaLabel: string;
  buttonsHtml: string;
  siteUrl: string;
}): string {
  const { companyName, headerTitle, employeeName, introAction, rows, ctaLabel, buttonsHtml, siteUrl } = opts;

  const rowsHtml = rows
    .map((row, i) => {
      const v = esc(row.value);
      let valueCell: string;
      if (row.style === "accent") {
        valueCell = `<strong style="color:#1B3A6B;font-weight:700;">${v}</strong>`;
      } else if (row.style === "bold") {
        valueCell = `<strong style="color:#111827;font-weight:700;">${v}</strong>`;
      } else if (row.style === "pill") {
        valueCell = `<span style="background:#EEF3FF;border:1px solid #C7D5F0;color:#1B3A6B;font-weight:700;padding:2px 10px;border-radius:12px;font-size:13px;display:inline-block;">${v}</span>`;
      } else {
        valueCell = v;
      }
      const bg = i % 2 === 1 ? "background:#F8FAFD;" : "";
      const border = i < rows.length - 1 ? "border-bottom:1px solid #E5E9F0;" : "";
      return `<tr style="${bg}"><td style="padding:11px 16px;font-size:13.5px;color:#6B7280;font-weight:500;width:130px;white-space:nowrap;${border}">${esc(row.label)}</td><td style="padding:11px 16px;font-size:13.5px;color:#111827;${border}">${valueCell}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#E8ECF3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 16px rgba(27,58,107,0.10),0 1px 4px rgba(0,0,0,0.06);">
<div style="background:#1B3A6B;padding:22px 32px;">
<div style="font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.55);">${esc(companyName)}</div>
<div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:2px;">${esc(headerTitle)} &mdash; Action Required</div>
</div>
<div style="padding:28px 32px 24px;">
<p style="font-size:14px;color:#6B7280;margin:0 0 14px;">Hi,</p>
<p style="font-size:15px;color:#1F2937;margin:0 0 16px;line-height:1.55;"><strong style="color:#1B3A6B;font-weight:700;">${esc(employeeName)}</strong> has submitted ${esc(introAction)} that requires your approval.</p>
<div style="display:inline-block;background:#EEF3FF;border:1px solid #C7D5F0;color:#1B3A6B;font-size:12px;font-weight:600;letter-spacing:0.04em;padding:4px 12px;border-radius:20px;margin-bottom:20px;text-transform:uppercase;">&#x25CF;&nbsp;&nbsp;Awaiting Review</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #E5E9F0;margin-bottom:24px;" cellpadding="0" cellspacing="0"><tbody>${rowsHtml}</tbody></table>
<p style="font-size:13px;color:#6B7280;margin:0 0 12px;">${esc(ctaLabel)}</p>
${buttonsHtml}
<div style="height:1px;background:#E5E9F0;margin:24px 0 0;"></div>
</div>
<div style="padding:0 32px 28px;">
<p style="font-size:12.5px;color:#9CA3AF;line-height:1.6;margin:0;">Or review this request directly in the <a href="${siteUrl}" style="color:#2563EB;text-decoration:none;">TIA HRMS &#x2192;</a></p>
<p style="font-size:12.5px;color:#9CA3AF;line-height:1.6;margin:6px 0 0;">This is an automated notification from ${esc(companyName)} HRMS. Do not reply to this email.</p>
</div>
</div>
</div>
</body>
</html>`;
}

function buildActionButtonsHtml(approveUrl: string, declineUrl: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td style="padding-right:10px;"><a href="${approveUrl}" style="display:inline-block;background:#16A34A;color:#ffffff;padding:11px 28px;border-radius:6px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;">Approve</a></td><td><a href="${declineUrl}" style="display:inline-block;background:#DC2626;color:#ffffff;padding:11px 28px;border-radius:6px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;">Decline</a></td></tr></table>`;
}

async function issueToken(kind: "LEAVE" | "EXPENSE" | "TIME_OFF", targetId: string): Promise<string> {
  const token = generateEndpointToken();
  const expiresAt = new Date(Date.now() + APPROVAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.approvalToken.create({
    data: { token, kind, targetId, expiresAt },
  });
  return token;
}

export async function sendLeaveApprovalEmail(args: {
  leaveRequestId: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number | string;
  reason?: string | null;
  documentUrl?: string | null;
  documentFileName?: string | null;
}): Promise<void> {
  if (await isDemoEmployee(args.employeeId)) return; // demo / App Review: never email real approvers
  const token = await issueToken("LEAVE", args.leaveRequestId);
  const base = getBaseUrl();
  const approveUrl = `${base}/api/public/leave-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/leave-approval/respond?token=${token}&action=decline`;

  const { subject } = await renderEmail("LEAVE_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
    START_DATE: formatDateDisplay(args.startDate),
  });

  const branding = await getCompanyBranding();
  const days = Number(args.days);
  const html = buildNotificationEmailHtml({
    companyName: branding.name,
    headerTitle: "Leave Request",
    employeeName: args.employeeName,
    introAction: "a leave request",
    rows: [
      { label: "Leave Type", value: args.leaveType, style: "accent" },
      { label: "Period", value: `${formatDateDisplay(args.startDate)} – ${formatDateDisplay(args.endDate)}`, style: "bold" },
      { label: "Duration", value: `${days} day${days === 1 ? "" : "s"}`, style: "pill" },
      { label: "Reason", value: args.reason || "—" },
    ],
    ctaLabel: "Please review and take action:",
    buttonsHtml: buildActionButtonsHtml(approveUrl, declineUrl),
    siteUrl: base,
  });

  const { to, cc } = await getApproverEmails();
  const attachment = await attachmentFromLocalUrl(args.documentUrl, args.documentFileName);
  const attachments = attachment ? [attachment] : undefined;
  await Promise.all(to.map((recipient) => sendEmail({ to: recipient, subject, html, cc, attachments })));
}

export async function sendExpenseApprovalEmail(args: {
  expenseClaimId: string;
  employeeId: string;
  employeeName: string;
  category: string;
  amount: number | string;
  expenseDate: string;
  description: string;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
}): Promise<void> {
  if (await isDemoEmployee(args.employeeId)) return; // demo / App Review: never email real approvers
  const token = await issueToken("EXPENSE", args.expenseClaimId);
  const base = getBaseUrl();
  const approveUrl = `${base}/api/public/expense-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/expense-approval/respond?token=${token}&action=decline`;

  const { subject } = await renderEmail("EXPENSE_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
    EXPENSE_DATE: formatDateDisplay(args.expenseDate),
  });

  const branding = await getCompanyBranding();
  const html = buildNotificationEmailHtml({
    companyName: branding.name,
    headerTitle: "Expense Claim",
    employeeName: args.employeeName,
    introAction: "an expense claim",
    rows: [
      { label: "Category", value: args.category, style: "accent" },
      { label: "Amount", value: String(args.amount), style: "bold" },
      { label: "Date", value: formatDateDisplay(args.expenseDate) },
      { label: "Description", value: args.description },
    ],
    ctaLabel: "Please review and take action:",
    buttonsHtml: buildActionButtonsHtml(approveUrl, declineUrl),
    siteUrl: base,
  });

  const { to, cc } = await getApproverEmails();
  const attachment = await attachmentFromLocalUrl(args.receiptUrl, args.receiptFileName);
  const attachments = attachment ? [attachment] : undefined;
  await Promise.all(to.map((recipient) => sendEmail({ to: recipient, subject, html, cc, attachments })));
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export async function sendTimeOffApprovalEmail(args: {
  timeOffRequestId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number | string;
  reason: string;
  reasonDetail?: string | null;
  /** Full-day Off Day (intern): show "Full day" instead of times and hours. */
  offDay?: boolean;
}): Promise<void> {
  if (await isDemoEmployee(args.employeeId)) return; // demo / App Review: never email real approvers
  const token = await issueToken("TIME_OFF", args.timeOffRequestId);
  const base = getBaseUrl();
  const approveUrl = `${base}/api/public/time-off-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/time-off-approval/respond?token=${token}&action=decline`;

  const dateDisplay = formatDateDisplay(args.date);
  const { subject } = await renderEmail("TIME_OFF_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
    DATE: dateDisplay,
  });

  const branding = await getCompanyBranding();
  const rows: Array<{ label: string; value: string; style?: RowStyle }> = args.offDay
    ? [
        { label: "Date", value: dateDisplay, style: "bold" },
        { label: "Duration", value: "Full day (no clock-in/out once approved)", style: "pill" },
        { label: "Reason", value: args.reason, style: "accent" },
      ]
    : [
        { label: "Date", value: dateDisplay, style: "bold" },
        { label: "Time", value: `${args.startTime} – ${args.endTime}` },
        { label: "Duration", value: `${args.hours} hour${Number(args.hours) === 1 ? "" : "s"}`, style: "pill" },
        { label: "Reason", value: args.reason, style: "accent" },
      ];
  if (args.reasonDetail) rows.push({ label: "Details", value: args.reasonDetail });

  const html = buildNotificationEmailHtml({
    companyName: branding.name,
    headerTitle: "Time Off Request",
    employeeName: args.employeeName,
    introAction: args.offDay ? "an Off Day" : "a time off request",
    rows,
    ctaLabel: "Please review and take action:",
    buttonsHtml: buildActionButtonsHtml(approveUrl, declineUrl),
    siteUrl: base,
  });

  const { to, cc } = await getApproverEmails();
  await Promise.all(to.map((recipient) => sendEmail({ to: recipient, subject, html, cc })));
}
