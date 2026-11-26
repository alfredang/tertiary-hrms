import { prisma } from "@/lib/prisma";
import { generatePayslipPDF } from "@/lib/pdf-generator";
import { getCompanyBranding } from "@/lib/company-settings";
import { isInternEmployee } from "@/lib/leave-policy";
import { countWorkingDays } from "@/lib/cpf-calculator";
import { internPaidDays } from "@/lib/intern-pay";

function renderPayslipRemarks(template: string | null | undefined, payslip: any): string | null {
  if (!template) return null;
  const monthLabel = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(payslip.payPeriodStart);
  return template
    .replace(/\{EMPLOYEE_NAME\}/g, payslip.employee?.name ?? "")
    .replace(/\{NRIC\}/g, payslip.employee?.nric ?? "")
    .replace(/\{MONTH\}/g, monthLabel)
    .replace(/\{BASIC_SALARY\}/g, Number(payslip.basicSalary).toFixed(2))
    .replace(/\{GROSS_SALARY\}/g, Number(payslip.grossSalary).toFixed(2))
    .replace(/\{CPF_EMPLOYEE\}/g, Number(payslip.cpfEmployee).toFixed(2))
    .replace(/\{CPF_EMPLOYER\}/g, Number(payslip.cpfEmployer).toFixed(2))
    .replace(/\{NET_SALARY\}/g, Number(payslip.netSalary).toFixed(2))
    .replace(/\{PAYMENT_DATE\}/g, new Intl.DateTimeFormat("en-SG", { day: "2-digit", month: "short", year: "numeric" }).format(payslip.paymentDate));
}

function sanitizeForFilename(s: string): string {
  // Replace anything that isn't a letter/digit/space/dash with a space,
  // collapse runs of whitespace, then dash-separate words.
  return s
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function payslipFileName(
  employeeIdOrName: string,
  payPeriodStart: Date,
  employeeName?: string,
) {
  const d = new Date(payPeriodStart);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  // Prefer the employee's full name when provided; fall back to the first arg
  // (kept positional for backward compatibility with older callers that passed
  // the employeeId as the first arg).
  const namePart = sanitizeForFilename(employeeName?.trim() || employeeIdOrName);
  return `${namePart}-${mm}-${yyyy}.pdf`;
}

/** Intern payslip lines for the PDF, from the stored payslip (src/lib/intern-pay.ts). */
function internPayLines(p: any) {
  const workingDays = countWorkingDays(p.payPeriodStart, p.payPeriodEnd);
  const npl = Number(p.nplDays ?? 0);
  const mc = Number(p.mcDays ?? 0);
  // Older payslips have only the combined unpaid days: show them as No Pay Leave.
  const split = npl + mc > 0;
  const nplDays = split ? npl : Number(p.unpaidLeaveDays ?? 0);
  const nplDeduction = split ? Number(p.nplDeduction ?? 0) : Number(p.unpaidLeaveDeduction ?? 0);
  const mcDeduction = split ? Number(p.mcDeduction ?? 0) : 0;
  const paybackDays = Number(p.paybackDays ?? 0);
  const paybackAmount = Number(p.paybackAmount ?? 0);
  const net = Number(p.netSalary);
  const roundingDown = Math.max(0, Math.round((Number(p.grossSalary) - nplDeduction - mcDeduction + paybackAmount - net) * 100) / 100);
  return {
    workingDays,
    nplDays,
    nplDeduction,
    mcDays: split ? mc : 0,
    mcDeduction,
    paybackDays,
    paybackAmount,
    paidDays: internPaidDays({ workingDays, nplDays, mcDays: split ? mc : 0, paybackDays }),
    roundingDown,
  };
}

export async function buildPayslipPdfBuffer(payslipId: string): Promise<Buffer> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { employee: { include: { department: true, user: { select: { roles: true } } } } },
  });
  if (!payslip) throw new Error("Payslip not found");
  const intern = isInternEmployee({ employmentType: payslip.employee.employmentType, roles: payslip.employee.user?.roles });
  const company = await getCompanyBranding();
  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const remarks = renderPayslipRemarks(
    (settings as any)?.payslipRemarks,
    payslip,
  );
  const pdfData = generatePayslipPDF({
    company: { name: company.name, address: company.address, logo: company.logo ?? null },
    employee: {
      name: payslip.employee.name,
      id: payslip.employee.employeeId,
      nric: payslip.employee.nric ?? null,
      department: payslip.employee.department?.name ?? "—",
      position: payslip.employee.position ?? "—",
    },
    remarks,
    titleTemplate: (settings as any)?.payslipTitle ?? null,
    headerNote: (settings as any)?.payslipHeaderNote ?? null,
    payPeriod: { start: payslip.payPeriodStart, end: payslip.payPeriodEnd },
    paymentDate: payslip.paymentDate,
    intern,
    earnings: {
      basicSalary: Number(payslip.basicSalary),
      allowances: Number(payslip.allowances),
      overtime: Number(payslip.overtime),
      bonus: Number(payslip.bonus),
      paybackDays: Number(payslip.paybackDays),
      paybackAmount: Number(payslip.paybackAmount),
      gross: Number(payslip.grossSalary),
    },
    deductions: {
      cpfEmployee: Number(payslip.cpfEmployee),
      incomeTax: Number(payslip.incomeTax),
      other: Number(payslip.otherDeductions),
      unpaidLeaveDays: Number(payslip.unpaidLeaveDays),
      unpaidLeaveAmount: Number(payslip.unpaidLeaveDeduction),
      total: Number(payslip.totalDeductions),
    },
    cpf: {
      employee: Number(payslip.cpfEmployee),
      employer: Number(payslip.cpfEmployer),
      total: Number(payslip.cpfEmployee) + Number(payslip.cpfEmployer),
    },
    netSalary: Number(payslip.netSalary),
    internPay: intern ? internPayLines(payslip) : undefined,
  });
  return Buffer.from(pdfData);
}
