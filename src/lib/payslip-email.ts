import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";
import { buildPayslipPdfBuffer, payslipFileName } from "@/lib/payslip-drive";
import { getCompanyBranding } from "@/lib/company-settings";
import { isInternEmployee } from "@/lib/leave-policy";
import { formatCurrency } from "@/lib/utils";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * The pay figures in the email body (Alfred, 26 Nov 2026): gross pay, CPF employee and employer
 * (interns: no CPF), unpaid leave and paybacks when there are any, and take-home pay.
 */
export function payslipSummaryHtml(p: {
  intern: boolean;
  gross: number;
  cpfEmployee: number;
  cpfEmployer: number;
  takeHome: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  paybackDays: number;
  paybackAmount: number;
}): string {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const rows: [string, string, boolean?][] = [];
  if (p.paybackDays > 0) rows.push([`Payback added back (${days(p.paybackDays)} worked)`, `+ ${formatCurrency(p.paybackAmount)}`]);
  rows.push(["Gross pay", formatCurrency(p.gross)]);
  if (p.unpaidLeaveDays > 0) {
    rows.push([`${p.intern ? "MC / No Pay Leave" : "No Pay Leave"} (${days(p.unpaidLeaveDays)})`, `- ${formatCurrency(p.unpaidLeaveDeduction)}`]);
  }
  if (p.intern) {
    rows.push(["CPF", "None (interns have no CPF)"]);
  } else {
    rows.push(["CPF (employee)", `- ${formatCurrency(p.cpfEmployee)}`]);
    rows.push(["CPF (employer, paid by the company)", formatCurrency(p.cpfEmployer)]);
  }
  rows.push(["Take-home pay", formatCurrency(p.takeHome), true]);
  const tr = rows
    .map(
      ([label, value, strong]) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;${strong ? "font-weight:700;" : ""}">${esc(label)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;${strong ? "font-weight:700;" : ""}">${esc(value)}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;margin:0 0 16px;min-width:320px;font-size:14px;">${tr}</table>`;
}

export async function emailPayslipToEmployee(payslipId: string): Promise<void> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    select: {
      payPeriodStart: true,
      netSalary: true,
      grossSalary: true,
      cpfEmployee: true,
      cpfEmployer: true,
      unpaidLeaveDays: true,
      unpaidLeaveDeduction: true,
      paybackDays: true,
      paybackAmount: true,
      employee: {
        select: {
          name: true,
          email: true,
          employeeId: true,
          employmentType: true,
          user: { select: { email: true, roles: true } },
        },
      },
    },
  });
  if (!payslip) throw new Error(`Payslip ${payslipId} not found`);

  const toEmail = payslip.employee.email || payslip.employee.user?.email;
  if (!toEmail) throw new Error(`No email address for employee ${payslip.employee.name}`);

  const company = await getCompanyBranding();
  const monthLabel = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(
    new Date(payslip.payPeriodStart),
  );
  const filename = payslipFileName(
    payslip.employee.employeeId,
    new Date(payslip.payPeriodStart),
    payslip.employee.name,
  );
  const pdfBuffer = await buildPayslipPdfBuffer(payslipId);
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  await sendEmail({
    to: toEmail,
    subject: `Your payslip for ${monthLabel} — ${company.name}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">
<p style="margin:0 0 12px;">Hi ${payslip.employee.name},</p>
<p style="margin:0 0 12px;">Please find your payslip for <strong>${monthLabel}</strong> attached to this email.</p>
${payslipSummaryHtml({
  intern: isInternEmployee({ employmentType: payslip.employee.employmentType, roles: payslip.employee.user?.roles }),
  gross: Number(payslip.grossSalary),
  cpfEmployee: Number(payslip.cpfEmployee),
  cpfEmployer: Number(payslip.cpfEmployer),
  takeHome: Number(payslip.netSalary),
  unpaidLeaveDays: Number(payslip.unpaidLeaveDays),
  unpaidLeaveDeduction: Number(payslip.unpaidLeaveDeduction),
  paybackDays: Number(payslip.paybackDays),
  paybackAmount: Number(payslip.paybackAmount),
})}
<p style="margin:0 0 12px;">You can also view and download all past payslips by logging in to TIA HRMS.</p>
<p style="margin:20px 0;">
  <a href="${siteUrl}/payroll"
     style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;">
    View in TIA HRMS
  </a>
</p>
<p style="color:#6b7280;font-size:12px;margin:0 0 8px;">
  This email and its attachment are confidential. Please do not share or forward.
</p>
<p style="margin:0;">— ${company.name}</p>
</div>`,
    attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
  });
}
