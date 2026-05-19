import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { calculatePayroll, prorateMonthlySalary } from "@/lib/cpf-calculator";
import { uploadPayslipToDrive } from "@/lib/payslip-drive";

// Update salary info for a staff (non-intern) employee.
// Accepts partial fields; keeps existing values for anything not supplied.
// On save, regenerates the current-month payslip and replaces the Drive PDF.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["ADMIN", "HR"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

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

  // Auto-regenerate current-month payslip if employee is active for this period
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const payPeriodStart = new Date(year, month - 1, 1);
  const payPeriodEnd = new Date(year, month, 0);
  const paymentDate = new Date(year, month - 1, 28);

  const startedBefore = employee.startDate ? new Date(employee.startDate) <= payPeriodEnd : true;
  const endedAfter = employee.endDate ? new Date(employee.endDate) >= payPeriodStart : true;
  if (!startedBefore || !endedAfter || !employee.dateOfBirth) {
    return NextResponse.json({ ok: true, payslipUpdated: false });
  }

  let proratedBasic = next.basicSalary;
  let proratedAllow = next.allowances;
  if (employee.startDate) {
    const startD = new Date(employee.startDate);
    const endD = employee.endDate ? new Date(employee.endDate) : new Date(8640000000000000);
    if (startD > payPeriodStart || endD < payPeriodEnd) {
      proratedBasic = prorateMonthlySalary(next.basicSalary, startD, endD, payPeriodStart, payPeriodEnd).amount;
      proratedAllow = prorateMonthlySalary(next.allowances, startD, endD, payPeriodStart, payPeriodEnd).amount;
    }
  }

  const payroll = calculatePayroll(
    proratedBasic,
    proratedAllow,
    employee.dateOfBirth,
    0, 0, 0, 0,
    { cpfApplicable: next.cpfApplicable },
  );

  const existingPayslip = await prisma.payslip.findUnique({
    where: {
      employeeId_payPeriodStart_payPeriodEnd: {
        employeeId: id, payPeriodStart, payPeriodEnd,
      },
    },
  });

  let payslipId: string;
  const data = {
    paymentDate,
    basicSalary: payroll.basicSalary,
    allowances: payroll.allowances,
    overtime: 0, bonus: 0,
    grossSalary: payroll.grossSalary,
    cpfEmployee: payroll.cpfEmployee,
    cpfEmployer: payroll.cpfEmployer,
    incomeTax: 0,
    otherDeductions: 0,
    totalDeductions: payroll.totalDeductions,
    netSalary: payroll.netSalary,
    status: "GENERATED" as const,
  };
  if (existingPayslip) {
    const updated = await prisma.payslip.update({ where: { id: existingPayslip.id }, data });
    payslipId = updated.id;
  } else {
    const created = await prisma.payslip.create({
      data: {
        id: `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        employeeId: id,
        payPeriodStart, payPeriodEnd,
        ...data,
      },
    });
    payslipId = created.id;
  }

  try {
    await uploadPayslipToDrive(payslipId);
  } catch (err) {
    console.error(`Drive upload failed for staff payslip ${payslipId}:`, err);
  }

  return NextResponse.json({ ok: true, payslipUpdated: true, payslipId });
}
