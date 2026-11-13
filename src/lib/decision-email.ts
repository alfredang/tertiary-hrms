// The decision email a staff member / intern receives after their leave, expense claim or
// time-off request is approved or rejected — by any path (web, bulk, mobile app, email link).
// To: the requester. Cc: both admins (staffAlertCc → tansc@ + angch@).
// Body: the editable template (Settings → Email templates) + request details + the same
// year-to-date summary the admin sees on the approval result page.
// Never throws: a failed email must never fail or roll back the decision.
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";
import { renderEmail } from "@/lib/email-templates/render";
import { getCompanyBranding } from "@/lib/company-settings";
import { getBaseUrl } from "@/lib/webhooks";
import { staffAlertCc } from "@/lib/admin-alerts";
import { isDemoEmail } from "@/lib/demo-guard";
import { escapeHtml as esc, type ResultSummary } from "@/lib/approval-result";
import { loadLeaveSummary, loadExpenseSummary, loadTimeOffSummary } from "@/lib/approval-summaries";
import { timeOffReasonLabel, timeOffWhen, isOffDay } from "@/lib/time-off";
import { formatCurrency } from "@/lib/utils";
import type { TemplateKey } from "@/lib/email-templates/defaults";

export type Decision = "APPROVED" | "REJECTED";

export interface DecisionOptions {
  approverName?: string | null;
  /** Approval note or rejection reason entered by the approver. */
  comment?: string | null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const prettyDate = (d: Date) =>
  new Date(`${ymd(d)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Email-client-safe (table-only) rendering of the summary block. */
export function summaryEmailHtml(s: ResultSummary): string {
  const width = Math.floor(100 / Math.max(1, s.stats.length));
  const stats = s.stats
    .map(
      (st) =>
        `<td style="width:${width}%;padding:4px;vertical-align:top;"><div style="background:#F5F8FC;border:1px solid #E5E9F0;border-radius:8px;padding:12px;">` +
        `<div style="font-size:12px;color:#6B7280;">${esc(st.label)}</div>` +
        `<div style="font-size:19px;font-weight:700;color:#1B3A6B;margin-top:3px;white-space:nowrap;">${esc(st.value)}</div>` +
        (st.hint ? `<div style="font-size:11.5px;color:#6B7280;margin-top:2px;">${esc(st.hint)}</div>` : "") +
        `</div></td>`,
    )
    .join("");
  let table = "";
  if (s.table && s.table.rows.length) {
    const align = (i: number) => (i === 0 ? "left" : "right");
    const head = s.table.columns
      .map((c, i) => `<th style="text-align:${align(i)};padding:8px 12px;font-size:12px;color:#6B7280;font-weight:600;border-bottom:1px solid #E5E9F0;">${esc(c)}</th>`)
      .join("");
    const body = s.table.rows
      .map(
        (r, ri) =>
          `<tr style="${ri % 2 ? "background:#F8FAFD;" : ""}">${r
            .map((c, i) => `<td style="text-align:${align(i)};padding:8px 12px;font-size:13.5px;color:#111827;white-space:nowrap;">${esc(c)}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    table = `<table style="width:100%;border-collapse:collapse;border:1px solid #E5E9F0;margin-top:12px;" cellpadding="0" cellspacing="0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  return (
    `<div style="font-size:14px;font-weight:700;color:#1B3A6B;margin:24px 0 8px;">${esc(s.heading)}</div>` +
    `<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0"><tr>${stats}</tr></table>` +
    table +
    (s.note ? `<p style="font-size:12px;color:#9CA3AF;margin:10px 0 0;">${esc(s.note)}</p>` : "")
  );
}

export function buildDecisionEmailHtml(opts: {
  companyName: string;
  headerTitle: string;
  decision: Decision;
  bodyText: string;
  rows: Array<{ label: string; value: string }>;
  summary: ResultSummary | null;
  siteUrl: string;
}): string {
  const approved = opts.decision === "APPROVED";
  const pill = approved
    ? `<span style="display:inline-block;background:#DCFCE7;border:1px solid #86EFAC;color:#15803D;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:4px 12px;border-radius:20px;text-transform:uppercase;">&#10003;&nbsp;Approved</span>`
    : `<span style="display:inline-block;background:#FEE2E2;border:1px solid #FCA5A5;color:#B91C1C;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:4px 12px;border-radius:20px;text-transform:uppercase;">&#10005;&nbsp;Not approved</span>`;
  const paragraphs = opts.bodyText
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:14.5px;color:#1F2937;margin:0 0 12px;line-height:1.6;">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const rows = opts.rows
    .map((r, i) => {
      const border = i < opts.rows.length - 1 ? "border-bottom:1px solid #E5E9F0;" : "";
      const bg = i % 2 ? "background:#F8FAFD;" : "";
      return `<tr style="${bg}"><td style="padding:10px 16px;font-size:13.5px;color:#6B7280;width:130px;white-space:nowrap;${border}">${esc(r.label)}</td><td style="padding:10px 16px;font-size:13.5px;color:#111827;font-weight:600;${border}">${esc(r.value)}</td></tr>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#E8ECF3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 16px rgba(27,58,107,0.10),0 1px 4px rgba(0,0,0,0.06);">
<div style="background:#1B3A6B;padding:22px 32px;">
<div style="font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.55);">${esc(opts.companyName)}</div>
<div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:2px;">${esc(opts.headerTitle)} &mdash; ${approved ? "Approved" : "Not Approved"}</div>
</div>
<div style="padding:28px 32px 24px;">
<div style="margin-bottom:18px;">${pill}</div>
${paragraphs}
<table style="width:100%;border-collapse:collapse;border:1px solid #E5E9F0;margin-top:6px;" cellpadding="0" cellspacing="0"><tbody>${rows}</tbody></table>
${opts.summary ? summaryEmailHtml(opts.summary) : ""}
<div style="height:1px;background:#E5E9F0;margin:24px 0 0;"></div>
</div>
<div style="padding:0 32px 28px;">
<p style="font-size:12.5px;color:#9CA3AF;line-height:1.6;margin:0;">View your records in <a href="${esc(opts.siteUrl)}" style="color:#2563EB;text-decoration:none;">TIA HRMS &#x2192;</a></p>
<p style="font-size:12.5px;color:#9CA3AF;line-height:1.6;margin:6px 0 0;">This is an automated notification from ${esc(opts.companyName)} HRMS. Do not reply to this email.</p>
</div></div></div></body></html>`;
}

async function deliver(args: {
  to: string | null | undefined;
  templateKey: TemplateKey;
  vars: Record<string, string | number | undefined | null>;
  headerTitle: string;
  decision: Decision;
  rows: Array<{ label: string; value: string }>;
  summary: ResultSummary | null;
}): Promise<void> {
  const to = args.to?.trim();
  if (!to || isDemoEmail(to)) return;
  const [{ subject, body }, branding] = await Promise.all([
    renderEmail(args.templateKey, args.vars),
    getCompanyBranding().catch(() => null),
  ]);
  const html = buildDecisionEmailHtml({
    companyName: branding?.name || "TIA HRMS",
    headerTitle: args.headerTitle,
    decision: args.decision,
    bodyText: body,
    rows: args.rows,
    summary: args.summary,
    siteUrl: getBaseUrl(),
  });
  await sendEmail({ to, cc: staffAlertCc(to), subject, html });
}

const approverLabel = (o: DecisionOptions) => o.approverName?.trim() || "HR";

export async function sendLeaveDecisionEmail(leaveRequestId: string, decision: Decision, opts: DecisionOptions = {}): Promise<void> {
  try {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: { leaveType: true, employee: { select: { id: true, name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!leave) return;
    const summary = await loadLeaveSummary(leave.employeeId, leave.startDate.getUTCFullYear());
    const comment = opts.comment?.trim();
    const rows = [
      { label: "Status", value: decision === "APPROVED" ? "Approved" : "Not approved" },
      { label: "Leave type", value: leave.leaveType.name },
      { label: "Period", value: `${prettyDate(leave.startDate)} – ${prettyDate(leave.endDate)}` },
      { label: "Duration", value: `${Number(leave.days)} day${Number(leave.days) === 1 ? "" : "s"}` },
      ...(leave.reason ? [{ label: "Reason", value: leave.reason }] : []),
      { label: decision === "APPROVED" ? "Approved by" : "Decided by", value: approverLabel(opts) },
      ...(comment ? [{ label: decision === "APPROVED" ? "Note" : "Reason given", value: comment }] : []),
    ];
    await deliver({
      to: leave.employee.user?.email || leave.employee.email,
      templateKey: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      vars: {
        EMPLOYEE_NAME: leave.employee.name,
        LEAVE_TYPE: leave.leaveType.name,
        START_DATE: ymd(leave.startDate),
        END_DATE: ymd(leave.endDate),
        DAYS: String(Number(leave.days)),
        APPROVER_NAME: approverLabel(opts),
      },
      headerTitle: "Leave Request",
      decision,
      rows,
      summary,
    });
  } catch (err) {
    console.error(`Leave decision email failed for ${leaveRequestId}:`, err);
  }
}

export async function sendExpenseDecisionEmail(claimId: string, decision: Decision, opts: DecisionOptions = {}): Promise<void> {
  try {
    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { category: true, employee: { select: { name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!claim) return;
    const summary = await loadExpenseSummary(claim.employeeId, claim.expenseDate.getUTCFullYear());
    const comment = opts.comment?.trim();
    const amount = formatCurrency(Number(claim.amount));
    await deliver({
      to: claim.employee.user?.email || claim.employee.email,
      templateKey: decision === "APPROVED" ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED",
      vars: {
        EMPLOYEE_NAME: claim.employee.name,
        CATEGORY: claim.category.name,
        AMOUNT: amount,
        EXPENSE_DATE: ymd(claim.expenseDate),
        DESCRIPTION: claim.description,
        APPROVER_NAME: approverLabel(opts),
      },
      headerTitle: "Expense Claim",
      decision,
      rows: [
        { label: "Status", value: decision === "APPROVED" ? "Approved" : "Not approved" },
        { label: "Category", value: claim.category.name },
        { label: "Amount", value: amount },
        { label: "Expense date", value: prettyDate(claim.expenseDate) },
        ...(claim.description ? [{ label: "Description", value: claim.description }] : []),
        { label: decision === "APPROVED" ? "Approved by" : "Decided by", value: approverLabel(opts) },
        ...(comment ? [{ label: decision === "APPROVED" ? "Note" : "Reason given", value: comment }] : []),
      ],
      summary,
    });
  } catch (err) {
    console.error(`Expense decision email failed for ${claimId}:`, err);
  }
}

export async function sendTimeOffDecisionEmail(requestId: string, decision: Decision, opts: DecisionOptions = {}): Promise<void> {
  try {
    const req = await prisma.timeOffRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!req) return;
    const summary = await loadTimeOffSummary(req.employeeId, req.date);
    const comment = opts.comment?.trim();
    const date = prettyDate(req.date);
    await deliver({
      to: req.employee.user?.email || req.employee.email,
      templateKey: decision === "APPROVED" ? "TIME_OFF_APPROVED" : "TIME_OFF_REJECTED",
      vars: {
        EMPLOYEE_NAME: req.employee.name,
        DATE: date,
        START_TIME: req.startTime,
        END_TIME: req.endTime,
        HOURS: String(Number(req.hours)),
        APPROVER_NAME: approverLabel(opts),
      },
      headerTitle: "Time Off Request",
      decision,
      rows: [
        { label: "Status", value: decision === "APPROVED" ? "Approved" : "Not approved" },
        { label: "Date", value: date },
        { label: "Time", value: timeOffWhen(req) },
        ...(isOffDay(req.reason) && decision === "APPROVED"
          ? [{ label: "Clock in/out", value: "Not needed on this day" }]
          : []),
        { label: "Reason", value: timeOffReasonLabel(req.reason) + (req.reasonDetail ? ` — ${req.reasonDetail}` : "") },
        { label: decision === "APPROVED" ? "Approved by" : "Decided by", value: approverLabel(opts) },
        ...(comment ? [{ label: decision === "APPROVED" ? "Note" : "Reason given", value: comment }] : []),
      ],
      summary,
    });
  } catch (err) {
    console.error(`Time-off decision email failed for ${requestId}:`, err);
  }
}
