import { prisma } from "@/lib/prisma";
import { generatePayslipPDF } from "@/lib/pdf-generator";
import { getCompanyBranding } from "@/lib/company-settings";
import { getEmployeeSubfolderId, uploadPdfToFolder } from "@/lib/drive";

export function payslipFileName(employeeId: string, payPeriodStart: Date) {
  return `Payslip_${payPeriodStart.toISOString().slice(0, 7)}_${employeeId}.pdf`;
}

export async function buildPayslipPdfBuffer(payslipId: string): Promise<Buffer> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { employee: { include: { department: true } } },
  });
  if (!payslip) throw new Error("Payslip not found");
  const company = await getCompanyBranding();
  const pdfData = generatePayslipPDF({
    company: { name: company.name, address: company.address },
    employee: {
      name: payslip.employee.name,
      id: payslip.employee.employeeId,
      department: payslip.employee.department?.name ?? "—",
      position: payslip.employee.position ?? "—",
    },
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
    select: { employeeId: true, payPeriodStart: true, employee: { select: { employeeId: true } } },
  });
  if (!payslip) return null;
  const folderId = await getEmployeeSubfolderId(payslip.employeeId, "Payroll");
  if (!folderId) return null;
  const buffer = await buildPayslipPdfBuffer(payslipId);
  const fileName = payslipFileName(payslip.employee.employeeId, payslip.payPeriodStart);
  const result = await uploadPdfToFolder(folderId, fileName, buffer, { replaceByName: true });
  await prisma.payslip.update({
    where: { id: payslipId },
    data: { driveFileId: result.id, driveWebViewLink: result.webViewLink ?? undefined },
  });
  return result;
}
