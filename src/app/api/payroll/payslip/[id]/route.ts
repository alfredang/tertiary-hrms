import { NextRequest, NextResponse } from "next/server";
import { requirePayEditor } from "@/lib/pay-edit-gate";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, countWorkingDays } from "@/lib/cpf-calculator";
import { internPayslipFigures } from "@/lib/intern-pay";
import { isInternEmployee } from "@/lib/leave-policy";
import * as z from "zod";

const patchSchema = z.object({
  grossSalary: z.number().min(0),
  basicSalary: z.number().min(0).optional(),
  allowances: z.number().min(0).optional(),
  remarks: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Pay-edit guardrail: admins only (src/lib/pay-edit-policy.ts).
    const refused = await requirePayEditor();
    if (refused) return refused;

    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 400 });
    }

    const payslip = await prisma.payslip.findUnique({
      where: { id },
      include: { employee: { include: { user: { select: { roles: true } } } } },
    });
    if (!payslip) {
      return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
    }
    // Interns have no CPF, so they need no date of birth (Alfred, 26 Nov 2026).
    const isIntern = isInternEmployee({ employmentType: payslip.employee.employmentType, roles: payslip.employee.user?.roles });
    if (!isIntern && !payslip.employee.dateOfBirth) {
      return NextResponse.json({ error: "Employee has no date of birth on record" }, { status: 400 });
    }

    // Interns: the hard-coded formula (src/lib/intern-pay.ts), with the payslip's own days.
    if (isIntern) {
      const nplStored = Number(payslip.nplDays);
      const mcStored = Number(payslip.mcDays);
      // Older payslips have only the combined unpaid days: count them as No Pay Leave.
      const nplDays = nplStored + mcStored > 0 ? nplStored : Number(payslip.unpaidLeaveDays);
      const f = internPayslipFigures({
        monthlyAllowance: parsed.data.grossSalary,
        workingDays: countWorkingDays(payslip.payPeriodStart, payslip.payPeriodEnd),
        nplDays,
        mcDays: mcStored,
        paybackDays: Number(payslip.paybackDays),
      });
      const updatedIntern = await prisma.payslip.update({
        where: { id },
        data: {
          basicSalary: 0,
          allowances: f.grossSalary,
          grossSalary: f.grossSalary,
          cpfEmployee: 0,
          cpfEmployer: 0,
          incomeTax: 0,
          otherDeductions: 0,
          unpaidLeaveDays: f.nplDays + f.mcDays,
          unpaidLeaveDeduction: f.totalDeductions,
          nplDays: f.nplDays,
          nplDeduction: f.nplDeduction,
          mcDays: f.mcDays,
          mcDeduction: f.mcDeduction,
          paybackAmount: f.paybackAmount,
          totalDeductions: f.totalDeductions,
          netSalary: f.netSalary,
        },
      });
      return NextResponse.json(updatedIntern);
    }

    // Staff: keep the unpaid-leave and payback lines. Gross is the base pay only; the payback is an
    // add-back to take-home (Alfred, 26 Nov 2026). CPF is on the pay actually earned
    // (gross − unpaid leave + payback); take-home = gross − deductions + payback.
    const gross = parsed.data.grossSalary;
    const unpaid = Number(payslip.unpaidLeaveDeduction);
    const payback = Number(payslip.paybackAmount);
    const earned = Math.max(0, gross - unpaid + payback);
    const recalc = calculatePayroll(earned, 0, payslip.employee.dateOfBirth as Date, 0, 0, 0, 0, { cpfApplicable: true });
    const totalDeductions = Math.round((recalc.cpfEmployee + unpaid) * 100) / 100;

    const updated = await prisma.payslip.update({
      where: { id },
      data: {
        basicSalary: parsed.data.basicSalary ?? gross,
        allowances: parsed.data.allowances ?? 0,
        grossSalary: gross,
        cpfEmployee: recalc.cpfEmployee,
        cpfEmployer: recalc.cpfEmployer,
        incomeTax: 0,
        otherDeductions: 0,
        totalDeductions,
        netSalary: Math.round((gross + payback - totalDeductions) * 100) / 100,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating payslip:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
