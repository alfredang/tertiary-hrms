import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { sendEmail, type EmailAttachment } from "@/lib/send-email";
import { renderEmail } from "@/lib/email-templates/render";
import { getCompanyBranding } from "@/lib/company-settings";
import { generateEndpointToken, getBaseUrl } from "@/lib/webhooks";
import type { TemplateKey } from "@/lib/email-templates/defaults";

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

const APPROVAL_TOKEN_TTL_DAYS = 14;

const FALLBACK_APPROVERS = ["tansc@tertiaryinfotech.com"];
const ALWAYS_CC = ["angch@tertiaryinfotech.com"];

async function getApproverEmails(employeeId?: string): Promise<{ to: string[]; cc: string[] }> {
  const recipients = new Set<string>();

  // Always include users with ADMIN or HR role
  const adminUsers = await prisma.user.findMany({
    where: { roles: { hasSome: ["ADMIN", "HR"] } },
    select: { email: true },
  });
  for (const u of adminUsers) {
    if (u.email) recipients.add(u.email.toLowerCase());
  }

  // Also include the employee's direct manager if set
  if (employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { managerId: true },
    });
    if (emp?.managerId) {
      const manager = await prisma.employee.findUnique({
        where: { id: emp.managerId },
        select: { email: true },
      });
      if (manager?.email) recipients.add(manager.email.toLowerCase());
    }
  }

  // Also include CompanySettings.approvalEmails
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
    select: { approvalEmails: true },
  });
  for (const email of settings?.approvalEmails ?? []) {
    if (email) recipients.add(email.toLowerCase());
  }

  // Fall back to hard-coded defaults if nothing found
  if (recipients.size === 0) {
    for (const email of FALLBACK_APPROVERS) recipients.add(email);
  }

  const toList = Array.from(recipients);
  const ccList = ALWAYS_CC.filter((c) => !recipients.has(c.toLowerCase()));
  return { to: toList, cc: ccList };
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
<p style="font-size:12.5px;color:#9CA3AF;line-height:1.6;margin:0;">Or review this request directly in the <a href="${siteUrl}" style="color:#2563EB;text-decoration:none;">HR Portal &#x2192;</a></p>
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

function textToHtml(body: string, actionButtonsHtml: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withButtons = escaped.replace(/\{ACTION_BUTTONS\}/g, actionButtonsHtml);
  const paragraphs = withButtons
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">${paragraphs}</div>`;
}

async function issueToken(kind: "LEAVE" | "EXPENSE", targetId: string): Promise<string> {
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
  const token = await issueToken("LEAVE", args.leaveRequestId);
  const base = getBaseUrl();
  const approveUrl = `${base}/api/public/leave-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/leave-approval/respond?token=${token}&action=decline`;

  const { subject } = await renderEmail("LEAVE_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
    START_DATE: args.startDate,
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
      { label: "Period", value: `${args.startDate} – ${args.endDate}`, style: "bold" },
      { label: "Duration", value: `${days} day${days === 1 ? "" : "s"}`, style: "pill" },
      { label: "Reason", value: args.reason || "—" },
    ],
    ctaLabel: "Please review and take action:",
    buttonsHtml: buildActionButtonsHtml(approveUrl, declineUrl),
    siteUrl: base,
  });

  const { to, cc } = await getApproverEmails(args.employeeId);
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
  const token = await issueToken("EXPENSE", args.expenseClaimId);
  const base = getBaseUrl();
  const approveUrl = `${base}/api/public/expense-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/expense-approval/respond?token=${token}&action=decline`;

  const { subject } = await renderEmail("EXPENSE_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
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
      { label: "Date", value: args.expenseDate },
      { label: "Description", value: args.description },
    ],
    ctaLabel: "Please review and take action:",
    buttonsHtml: buildActionButtonsHtml(approveUrl, declineUrl),
    siteUrl: base,
  });

  const { to, cc } = await getApproverEmails(args.employeeId);
  const attachment = await attachmentFromLocalUrl(args.receiptUrl, args.receiptFileName);
  const attachments = attachment ? [attachment] : undefined;
  await Promise.all(to.map((recipient) => sendEmail({ to: recipient, subject, html, cc, attachments })));
}

export async function sendDecisionEmailToStaff(args: {
  templateKey: TemplateKey;
  staffEmail: string;
  vars: Record<string, string | number | undefined | null>;
}): Promise<void> {
  const { subject, body } = await renderEmail(args.templateKey, args.vars);
  const html = textToHtml(body, "");
  await sendEmail({ to: args.staffEmail, subject, html });
}
