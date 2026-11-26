import { NextRequest, NextResponse } from "next/server";
import { requirePayEditor } from "@/lib/pay-edit-gate";
import { prisma } from "@/lib/prisma";
import { refreshBaseSalaryPayslip } from "@/lib/payroll-month-end";

// Update salary info for a staff (non-intern) employee.
// Accepts partial fields; keeps existing values for anything not supplied.
// On save, re-works the current month's base-salary payslip, if there is one (never a CPF one).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Pay-edit guardrail: admins only (src/lib/pay-edit-policy.ts).
  const refused = await requirePayEditor();
  if (refused) return refused;

  const { id } = await params;
  const body = await req.json();

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { salaryInfo: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (employee.employmentType === "INTERN") {
    return NextResponse.json(
      { error: "Use the intern-allowance endpoint for interns" },
      { status: 400 },
    );
  }

  const existing = employee.salaryInfo;
  const next = {
    basicSalary: body.basicSalary !== undefined ? Number(body.basicSalary) : Number(existing?.basicSalary ?? 0),
    allowances: body.allowances !== undefined ? Number(body.allowances) : Number(existing?.allowances ?? 0),
    cpfApplicable: body.cpfApplicable !== undefined ? Boolean(body.cpfApplicable) : (existing?.cpfApplicable ?? true),
    cpfEmployeeRate: body.cpfEmployeeRate !== undefined ? Number(body.cpfEmployeeRate) : Number(existing?.cpfEmployeeRate ?? 20),
    cpfEmployerRate: body.cpfEmployerRate !== undefined ? Number(body.cpfEmployerRate) : Number(existing?.cpfEmployerRate ?? 17),
    payNow: body.payNow !== undefined ? body.payNow : (existing?.payNow ?? null),
    bankName: body.bankName !== undefined ? body.bankName : (existing?.bankName ?? null),
    bankAccountNumber: body.bankAccountNumber !== undefined ? body.bankAccountNumber : (existing?.bankAccountNumber ?? null),
  };

  if (next.basicSalary < 0 || next.allowances < 0 || next.cpfEmployeeRate < 0 || next.cpfEmployerRate < 0) {
    return NextResponse.json(
      { error: "Salary, allowance and CPF rates must be non-negative" },
      { status: 400 },
    );
  }

  await prisma.salaryInfo.upsert({
    where: { employeeId: id },
    create: { employeeId: id, ...next },
    update: next,
  });

  // Payslip rule (Alfred, 26 Nov 2026; src/lib/payroll-month-end.ts): a salary change re-works the
  // current month's payslip only if it was made from base salary (with leave, paybacks and, for
  // interns, no CPF). It never touches a CPF-statement payslip and never creates one mid-month:
  // the month-end run makes it once the month is over.
  const now = new Date();
  const refresh = await refreshBaseSalaryPayslip(id, now.getMonth() + 1, now.getFullYear());
  return NextResponse.json({ ok: true, ...refresh });
}
