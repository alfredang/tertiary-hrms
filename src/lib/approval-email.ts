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
  // Prefer the employee's managers if set
  if (employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { managerId: true },
    });
    const ids = emp?.managerId ? [emp.managerId] : [];
    if (ids.length) {
      const managers = await prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { email: true },
      });
      const to = managers.map((m) => m.email).filter(Boolean);
      if (to.length) {
        return { to, cc: ALWAYS_CC.filter((c) => !to.includes(c)) };
      }
    }
  }

  // Fall back to CompanySettings.approvalEmails, then hard-coded default
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
    select: { approvalEmails: true },
  });
  const configured = (settings?.approvalEmails ?? []).filter(Boolean);
  const to = configured.length ? configured : FALLBACK_APPROVERS;
  return { to, cc: ALWAYS_CC.filter((c) => !to.includes(c)) };
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
    REASON: args.reason || "—",
    ACCEPT_URL: acceptUrl,
    DECLINE_URL: declineUrl,
    ACTION_BUTTONS: "{ACTION_BUTTONS}", // keep placeholder so HTML conversion injects the buttons
  });

  const { to, cc } = await getApproverEmails(args.employeeId);
  const html = textToHtml(body, actionButtons);
  const attachment = await attachmentFromLocalUrl(args.documentUrl, args.documentFileName);
  const attachments = attachment ? [attachment] : undefined;
  for (const recipient of to) {
    await sendEmail({ to: recipient, subject, html, cc, attachments });
  }
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
  for (const recipient of to) {
    await sendEmail({ to: recipient, subject, html, cc, attachments });
  }
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
