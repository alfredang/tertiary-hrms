import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";
import { buildPayslipPdfBuffer, payslipFileName } from "@/lib/payslip-drive";
import { getCompanyBranding } from "@/lib/company-settings";

export async function emailPayslipToEmployee(payslipId: string): Promise<void> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    select: {
      payPeriodStart: true,
      netSalary: true,
      grossSalary: true,
      employee: {
        select: {
          name: true,
          email: true,
          employeeId: true,
          user: { select: { email: true } },
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
<p style="margin:0 0 12px;">You can also view and download all past payslips by logging in to the HR Portal.</p>
<p style="margin:20px 0;">
  <a href="${siteUrl}/payroll"
     style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;">
    View in HR Portal
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
