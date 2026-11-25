import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";
import { isInternEmployee } from "@/lib/leave-policy";
import {
  canViewCpfSubmissions,
  cpfDownloadPath,
  cpfFileForPayslip,
  listCpfSubmissionFiles,
  type CpfSubmissionFile,
} from "@/lib/cpf-submission-files";

export const dynamic = "force-dynamic";

// GET /api/mobile/payslips — the signed-in employee's own payslips.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ payslips: [] });

  // Interns have no CPF: the apps show "No CPF" instead of 0.00 figures.
  const me = await prisma.employee.findUnique({
    where: { id: ctx.employeeId },
    select: { employmentType: true, user: { select: { roles: true } } },
  });
  const intern = isInternEmployee({ employmentType: me?.employmentType, roles: me?.user?.roles });

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: ctx.employeeId },
    orderBy: { payPeriodStart: "desc" },
    take: 60,
  });

  // Admins and accountants also get the CPF statement each payslip was built
  // from. Never staff: the statement lists everyone's NRIC and wages.
  let cpfFiles: CpfSubmissionFile[] = [];
  const showCpf = canViewCpfSubmissions(ctx.role, ctx.roles);
  if (showCpf) {
    cpfFiles = await listCpfSubmissionFiles().catch((err) => {
      console.error("CPF statement lookup for mobile payslips failed:", err);
      return [];
    });
  }

  return NextResponse.json({
    payslips: payslips.map((p) => {
      const cpf = showCpf ? cpfFileForPayslip(p, cpfFiles) : null;
      return {
      id: p.id,
      payPeriodStart: iso(p.payPeriodStart),
      payPeriodEnd: iso(p.payPeriodEnd),
      paymentDate: iso(p.paymentDate),
      basicSalary: num(p.basicSalary),
      allowances: num(p.allowances),
      overtime: num(p.overtime),
      bonus: num(p.bonus),
      grossSalary: num(p.grossSalary),
      cpfEmployee: num(p.cpfEmployee),
      cpfEmployer: num(p.cpfEmployer),
      // Interns: true, and both CPF figures are 0.
      intern,
      // Unpaid days taken (No Pay Leave; MC too for interns) and paybacks added back.
      unpaidLeaveDays: num(p.unpaidLeaveDays),
      unpaidLeaveDeduction: num(p.unpaidLeaveDeduction),
      paybackDays: num(p.paybackDays),
      paybackAmount: num(p.paybackAmount),
      totalDeductions: num(p.totalDeductions),
      netSalary: num(p.netSalary),
      status: p.status,
      // PDF is served (auth-gated) by the existing /api/payroll/payslip/[id]/pdf route.
      pdfPath: `/api/payroll/payslip/${p.id}/pdf`,
      // null for staff and for a payslip with no CPF statement on file.
      cpfSubmission: cpf
        ? { id: cpf.id, name: cpf.name, periodLabel: cpf.periodLabel, downloadPath: cpfDownloadPath(cpf.id) }
        : null,
      };
    }),
  });
}
