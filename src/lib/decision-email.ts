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
  /** The caller has already created the requester's in-app notification (and so the phone push). */
  alreadyNotified?: boolean;
}

/**
 * In-app notification for the requester; every Notification row is also pushed to their phones
 * (src/lib/prisma.ts → src/lib/push.ts). Sent from here so that every decision path — web, bulk,
 * app and the emailed Approve / Decline links — notifies the requester. Never throws.
 */
async function notifyRequester(userId: string | null | undefined, opts: DecisionOptions, note: { title: string; message: string; type: string; link: string }) {
  if (!userId || opts.alreadyNotified) return;
  try {
    const comment = opts.comment?.trim();
    const message = comment ? `${note.message} ${note.type.endsWith("REJECTED") ? "Reason" : "Note"}: ${comment}` : note.message;
    await prisma.notification.create({ data: { userId, title: note.title, message, type: note.type, link: note.link } });
  } catch (err) {
    console.error(`Decision notification failed (${note.type}):`, err);
  }
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
        // Always three rows (label, value, hint) so every tile is the same height.
        `<div style="font-size:11.5px;line-height:16px;color:#6B7280;margin-top:2px;">${st.hint ? esc(st.hint) : "&nbsp;"}</div>` +
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
<div style="max-width:760px;margin:0 auto;padding:24px 16px;">
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
      include: { leaveType: true, employee: { select: { id: true, userId: true, name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!leave) return;
    const leaveDays = `${Number(leave.days)} day${Number(leave.days) === 1 ? "" : "s"}`;
    await notifyRequester(leave.employee.userId, opts, decision === "APPROVED"
      ? { title: "Leave Request Approved", message: `Your ${leave.leaveType.name} request (${leaveDays}) has been approved.`, type: "LEAVE_APPROVED", link: "/leave" }
      : { title: "Leave Request Rejected", message: `Your ${leave.leaveType.name} request (${leaveDays}) was not approved.`, type: "LEAVE_REJECTED", link: "/leave" });
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
      include: { category: true, employee: { select: { userId: true, name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!claim) return;
    const claimLabel = `${claim.category.name} claim of ${formatCurrency(Number(claim.amount))}`;
    await notifyRequester(claim.employee.userId, opts, decision === "APPROVED"
      ? { title: "Expense Claim Approved", message: `Your ${claimLabel} has been approved.`, type: "EXPENSE_APPROVED", link: "/expenses" }
      : { title: "Expense Claim Rejected", message: `Your ${claimLabel} was not approved.`, type: "EXPENSE_REJECTED", link: "/expenses" });
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
      include: { employee: { select: { userId: true, name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!req) return;
    const timeOffLabel = `time off request (${prettyDate(req.date)}, ${timeOffWhen(req)})`;
    await notifyRequester(req.employee.userId, opts, decision === "APPROVED"
      ? { title: "Time Off Approved", message: `Your ${timeOffLabel} has been approved.`, type: "TIME_OFF_APPROVED", link: "/time-off" }
      : { title: "Time Off Rejected", message: `Your ${timeOffLabel} was not approved.`, type: "TIME_OFF_REJECTED", link: "/time-off" });
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

/**
 * No Pay Leave payback decision: to the requester, Cc both admins, with the leave summary so the
 * restored No Pay Leave balance is visible. Fixed wording (not an editable template).
 */
export async function sendPaybackDecisionEmail(paybackId: string, decision: Decision, opts: DecisionOptions = {}): Promise<void> {
  try {
    const pb = await prisma.nplPayback.findUnique({
      where: { id: paybackId },
      include: { employee: { select: { userId: true, name: true, email: true, user: { select: { email: true } } } } },
    });
    if (!pb) return;
    const day = (d: Date) =>
      `${new Date(`${ymd(d)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}, ${prettyDate(d)}`;
    const amount = Number(pb.days) === 0.5 ? "Half day" : `${Number(pb.days)} day${Number(pb.days) === 1 ? "" : "s"}`;
    const label = `No Pay Leave payback (worked ${prettyDate(pb.workDate)} for ${prettyDate(pb.nplDate)})`;
    const approved = decision === "APPROVED";
    await notifyRequester(pb.employee.userId, opts, approved
      ? { title: "Payback Approved", message: `Your ${label} has been approved. That No Pay Leave day is back in your balance.`, type: "PAYBACK_APPROVED", link: "/leave/payback" }
      : { title: "Payback Rejected", message: `Your ${label} was not approved.`, type: "PAYBACK_REJECTED", link: "/leave/payback" });
    const to = (pb.employee.user?.email || pb.employee.email)?.trim();
    if (!to || isDemoEmail(to)) return;
    const [summary, branding] = await Promise.all([
      loadLeaveSummary(pb.employeeId, pb.nplDate.getUTCFullYear()),
      getCompanyBranding().catch(() => null),
    ]);
    const companyName = branding?.name || "TIA HRMS";
    const comment = opts.comment?.trim();
    const bodyText = approved
      ? `Hi ${pb.employee.name},\n\nYour No Pay Leave payback has been approved by ${approverLabel(opts)}. The No Pay Leave on ${prettyDate(pb.nplDate)} no longer counts as taken, so it is back in your No Pay Leave balance.\n\n- ${companyName}`
      : `Hi ${pb.employee.name},\n\nYour No Pay Leave payback was not approved by ${approverLabel(opts)}. Your No Pay Leave balance is unchanged.\n\nPlease contact your manager if you have questions.\n\n- ${companyName}`;
    const html = buildDecisionEmailHtml({
      companyName,
      headerTitle: "No Pay Leave Payback",
      decision,
      bodyText,
      rows: [
        { label: "Status", value: approved ? "Approved" : "Not approved" },
        { label: "No Pay Leave", value: day(pb.nplDate) },
        { label: "Worked on", value: `${day(pb.workDate)} (off day)` },
        { label: "Pays back", value: amount },
        ...(pb.note ? [{ label: "Note", value: pb.note }] : []),
        { label: approved ? "Approved by" : "Decided by", value: approverLabel(opts) },
        ...(comment ? [{ label: approved ? "Note from approver" : "Reason given", value: comment }] : []),
      ],
      summary,
      siteUrl: getBaseUrl(),
    });
    await sendEmail({
      to,
      cc: staffAlertCc(to),
      subject: approved ? "Your No Pay Leave payback was approved" : "Your No Pay Leave payback was not approved",
      html,
    });
  } catch (err) {
    console.error(`Payback decision email failed for ${paybackId}:`, err);
  }
}
