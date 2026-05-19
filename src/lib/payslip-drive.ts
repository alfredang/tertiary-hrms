import { prisma } from "@/lib/prisma";
import { generatePayslipPDF } from "@/lib/pdf-generator";
import { getCompanyBranding } from "@/lib/company-settings";
import { getEmployeeSubfolderId, uploadPdfToFolder } from "@/lib/drive";

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

export async function buildPayslipPdfBuffer(payslipId: string): Promise<Buffer> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { employee: { include: { department: true } } },
  });
  if (!payslip) throw new Error("Payslip not found");
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
    earnings: {
      basicSalary: Number(payslip.basicSalary),
      allowances: Number(payslip.allowances),
      overtime: Number(payslip.overtime),
      bonus: Number(payslip.bonus),
      gross: Number(payslip.grossSalary),
    },
    deductions: {
      cpfEmployee: Number(payslip.cpfEmployee),
      incomeTax: Number(payslip.incomeTax),
      other: Number(payslip.otherDeductions),
      total: Number(payslip.totalDeductions),
    },
    cpf: {
      employee: Number(payslip.cpfEmployee),
      employer: Number(payslip.cpfEmployer),
      total: Number(payslip.cpfEmployee) + Number(payslip.cpfEmployer),
    },
    netSalary: Number(payslip.netSalary),
  });
  return Buffer.from(pdfData);
}

export async function uploadPayslipToDrive(payslipId: string): Promise<{ id: string; webViewLink: string | null } | null> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    select: { employeeId: true, payPeriodStart: true, employee: { select: { employeeId: true, name: true } } },
  });
  if (!payslip) return null;
  const folderId = await getEmployeeSubfolderId(payslip.employeeId, "Payroll");
  if (!folderId) return null;
  const buffer = await buildPayslipPdfBuffer(payslipId);
  const fileName = payslipFileName(payslip.employee.employeeId, payslip.payPeriodStart, payslip.employee.name);
  const result = await uploadPdfToFolder(folderId, fileName, buffer, { replaceByName: true });
  await prisma.payslip.update({
    where: { id: payslipId },
    data: { driveFileId: result.id, driveWebViewLink: result.webViewLink ?? undefined },
  });
  return result;
}
