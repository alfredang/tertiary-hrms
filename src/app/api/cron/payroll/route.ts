import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculatePayroll } from "@/lib/cpf-calculator";

// Auto-generate payroll on the 28th of each month
// Can be triggered by external scheduler or manually
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
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
        const salary = employee.salaryInfo;
        const payroll = calculatePayroll(
          Number(salary.basicSalary),
          Number(salary.allowances),
          employee.dateOfBirth ?? new Date()
        );

        await prisma.payslip.create({
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
