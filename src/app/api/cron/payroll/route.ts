import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, prorateMonthlySalary } from "@/lib/cpf-calculator";
import { uploadPayslipToDrive } from "@/lib/payslip-drive";

// Auto-generate payroll on the 28th of each month
// Can be triggered by external scheduler or manually
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret — reject if not configured (any environment)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const month = now.getMonth() + 1; // current month
    const year = now.getFullYear();

    // Pay period: 1st to last day of the month
    const payPeriodStart = new Date(year, month - 1, 1);
    const payPeriodEnd = new Date(year, month, 0);
    const paymentDate = new Date(year, month - 1, 28);

    // Get all active employees with salary info
    const employees = await prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        salaryInfo: { isNot: null },
      },
      include: {
        salaryInfo: true,
      },
    });

    const results = { created: 0, skipped: 0, errors: 0 };

    for (const employee of employees) {
      if (!employee.salaryInfo) {
        results.skipped++;
        continue;
      }

      // Check if payslip already exists
      const existing = await prisma.payslip.findUnique({
        where: {
          employeeId_payPeriodStart_payPeriodEnd: {
            employeeId: employee.id,
            payPeriodStart,
            payPeriodEnd,
          },
        },
      });

      if (existing) {
        results.skipped++;
        continue;
      }

      try {
        if (!employee.dateOfBirth) {
          results.skipped++;
          continue;
        }

        const salary = employee.salaryInfo;

        let proratedBasic = Number(salary.basicSalary);
        let proratedAllowances = Number(salary.allowances);
        if (employee.startDate) {
          const start = new Date(employee.startDate);
          const end = employee.endDate ? new Date(employee.endDate) : new Date(8640000000000000);
          if (start > payPeriodStart || end < payPeriodEnd) {
            proratedBasic = prorateMonthlySalary(
              Number(salary.basicSalary), start, end, payPeriodStart, payPeriodEnd,
            ).amount;
            proratedAllowances = prorateMonthlySalary(
              Number(salary.allowances), start, end, payPeriodStart, payPeriodEnd,
            ).amount;
          }
        }

        const isIntern = employee.employmentType === "INTERN";
        const payroll = calculatePayroll(
          proratedBasic,
          proratedAllowances,
          employee.dateOfBirth,
          0,
          0,
          0,
          isIntern ? 0 : 0.15,
          { cpfApplicable: !isIntern && (salary.cpfApplicable ?? true) },
        );

        const created = await prisma.payslip.create({
          data: {
            id: `ps_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            employeeId: employee.id,
            payPeriodStart,
            payPeriodEnd,
            paymentDate,
            basicSalary: payroll.basicSalary,
            allowances: payroll.allowances,
            overtime: payroll.overtime,
            bonus: payroll.bonus,
            grossSalary: payroll.grossSalary,
            cpfEmployee: payroll.cpfEmployee,
            cpfEmployer: payroll.cpfEmployer,
            incomeTax: payroll.incomeTax,
            otherDeductions: payroll.otherDeductions,
            totalDeductions: payroll.totalDeductions,
            netSalary: payroll.netSalary,
            status: "GENERATED",
          },
        });

        try {
          await uploadPayslipToDrive(created.id);
        } catch (err) {
          console.error(`Drive upload failed for payslip ${created.id}:`, err);
        }

        results.created++;
      } catch (error) {
        console.error(`Error generating payslip for ${employee.id}:`, error);
        results.errors++;
      }
    }

    return NextResponse.json({
      message: `Auto payroll generation for ${month}/${year}`,
      ...results,
    });
  } catch (error) {
    console.error("Cron payroll error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
