import { NextRequest, NextResponse } from "next/server";
import { requirePayEditor } from "@/lib/pay-edit-gate";
import { prisma } from "@/lib/prisma";
import { refreshBaseSalaryPayslip } from "@/lib/payroll-month-end";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Pay-edit guardrail: admins only (src/lib/pay-edit-policy.ts).
  const refused = await requirePayEditor();
  if (refused) return refused;

  const { id } = await params;
  const body = await req.json();
  const allowance = Number(body.allowance);
  if (!Number.isFinite(allowance) || allowance < 0) {
    return NextResponse.json(
      { error: "Allowance must be a non-negative number" },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { salaryInfo: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (employee.employmentType !== "INTERN") {
    return NextResponse.json(
      { error: "This endpoint is for interns only" },
      { status: 400 },
    );
  }

  // Upsert intern SalaryInfo: no basic salary, no CPF.
  await prisma.salaryInfo.upsert({
    where: { employeeId: id },
    create: {
      employeeId: id,
      basicSalary: 0,
      allowances: allowance,
      cpfApplicable: false,
      cpfEmployeeRate: 0,
      cpfEmployerRate: 0,
    },
    update: {
      basicSalary: 0,
      allowances: allowance,
      cpfApplicable: false,
      cpfEmployeeRate: 0,
      cpfEmployerRate: 0,
    },
  });

  // Payslip rule (Alfred, 26 Nov 2026; src/lib/payroll-month-end.ts): a salary change re-works the
  // current month's payslip only if it was made from base salary (with leave, paybacks and, for
  // interns, no CPF). It never touches a CPF-statement payslip and never creates one mid-month:
  // the month-end run makes it once the month is over.
  const now = new Date();
  const refresh = await refreshBaseSalaryPayslip(id, now.getMonth() + 1, now.getFullYear());
  return NextResponse.json({ ok: true, ...refresh });
}
