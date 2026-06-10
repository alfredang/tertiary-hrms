import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { sendEmail, type EmailAttachment } from "@/lib/send-email";
import { renderEmail } from "@/lib/email-templates/render";
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

function buildActionButtonsHtml(acceptUrl: string, declineUrl: string): string {
  return `
  <table cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
    <tr>
      <td style="padding-right: 12px;">
        <a href="${acceptUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Accept</a>
      </td>
      <td>
        <a href="${declineUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Decline</a>
      </td>
    </tr>
  </table>`;
}

function textToHtml(body: string, actionButtonsHtml: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withButtons = escaped.replace(/\{ACTION_BUTTONS\}/g, actionButtonsHtml);
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;white-space:pre-wrap;">${withButtons}</div>`;
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
  const acceptUrl = `${base}/api/public/leave-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/leave-approval/respond?token=${token}&action=decline`;
  const actionButtons = buildActionButtonsHtml(acceptUrl, declineUrl);

  const { subject, body } = await renderEmail("LEAVE_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
    LEAVE_TYPE: args.leaveType,
    START_DATE: args.startDate,
    END_DATE: args.endDate,
    DAYS: String(args.days),
    REASON: args.reason || "-",
    ACCEPT_URL: acceptUrl,
    DECLINE_URL: declineUrl,
    ACTION_BUTTONS: "{ACTION_BUTTONS}", // keep placeholder so HTML conversion injects the buttons
  });

  const { to, cc } = await getApproverEmails(args.employeeId);
  const html = textToHtml(body, actionButtons);
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
  const acceptUrl = `${base}/api/public/expense-approval/respond?token=${token}&action=accept`;
  const declineUrl = `${base}/api/public/expense-approval/respond?token=${token}&action=decline`;
  const actionButtons = buildActionButtonsHtml(acceptUrl, declineUrl);

  const { subject, body } = await renderEmail("EXPENSE_REQUEST", {
    EMPLOYEE_NAME: args.employeeName,
    CATEGORY: args.category,
    AMOUNT: String(args.amount),
    EXPENSE_DATE: args.expenseDate,
    DESCRIPTION: args.description,
    ACCEPT_URL: acceptUrl,
    DECLINE_URL: declineUrl,
    ACTION_BUTTONS: "{ACTION_BUTTONS}",
  });

  const { to, cc } = await getApproverEmails(args.employeeId);
  const html = textToHtml(body, actionButtons);
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
