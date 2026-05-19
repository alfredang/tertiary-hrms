import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { calculatePayroll, prorateMonthlySalary } from "@/lib/cpf-calculator";
import { uploadPayslipToDrive } from "@/lib/payslip-drive";

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

  // Auto-generate / refresh the current-month payslip.
  // Skip if intern isn't active during this period (hasn't started, or already ended).
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

  // Prorate allowance if intern started mid-month or ends mid-month.
  let proratedAllowance = allowance;
  if (employee.startDate) {
    const startD = new Date(employee.startDate);
    const endD = employee.endDate ? new Date(employee.endDate) : new Date(8640000000000000);
    if (startD > payPeriodStart || endD < payPeriodEnd) {
      proratedAllowance = prorateMonthlySalary(
        allowance, startD, endD, payPeriodStart, payPeriodEnd,
      ).amount;
    }
  }

  // Compute payroll with cpfApplicable=false so CPF rows are 0.
  const payroll = calculatePayroll(
    0,
    proratedAllowance,
    employee.dateOfBirth,
    0, 0, 0, 0,
    { cpfApplicable: false },
  );

  const existing = await prisma.payslip.findUnique({
    where: {
      employeeId_payPeriodStart_payPeriodEnd: {
        employeeId: id, payPeriodStart, payPeriodEnd,
      },
    },
  });

  let payslipId: string;
  if (existing) {
    const updated = await prisma.payslip.update({
      where: { id: existing.id },
      data: {
        paymentDate,
        basicSalary: 0,
        allowances: payroll.allowances,
        overtime: 0, bonus: 0,
        grossSalary: payroll.grossSalary,
        cpfEmployee: 0,
        cpfEmployer: 0,
        incomeTax: 0,
        otherDeductions: 0,
        totalDeductions: 0,
        netSalary: payroll.netSalary,
        status: "GENERATED",
      },
    });
    payslipId = updated.id;
  } else {
    const created = await prisma.payslip.create({
      data: {
        id: `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        employeeId: id,
        payPeriodStart, payPeriodEnd, paymentDate,
        basicSalary: 0,
        allowances: payroll.allowances,
        overtime: 0, bonus: 0,
        grossSalary: payroll.grossSalary,
        cpfEmployee: 0,
        cpfEmployer: 0,
        incomeTax: 0,
        otherDeductions: 0,
        totalDeductions: 0,
        netSalary: payroll.netSalary,
        status: "GENERATED",
      },
    });
    payslipId = created.id;
  }

  // Upload to Drive (best-effort)
  try {
    await uploadPayslipToDrive(payslipId);
  } catch (err) {
    console.error(`Drive upload failed for intern payslip ${payslipId}:`, err);
  }

  return NextResponse.json({ ok: true, payslipUpdated: true, payslipId });
}
