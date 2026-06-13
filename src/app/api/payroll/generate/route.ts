import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, prorateMonthlySalary } from "@/lib/cpf-calculator";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { uploadPayslipToDrive } from "@/lib/payslip-drive";
import { emailPayslipToEmployee } from "@/lib/payslip-email";

export async function POST(req: NextRequest) {
  try {
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const role = session.user.role;
      if (role !== "ADMIN" && role !== "HR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { month, year } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: "Month and year are required" },
        { status: 400 }
      );
    }

    // Pay period: 1st to last day of the month
    const payPeriodStart = new Date(year, month - 1, 1);
    const payPeriodEnd = new Date(year, month, 0); // last day of month
    const paymentDate = new Date(year, month - 1, 28); // payment on 28th

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

    if (employees.length === 0) {
      return NextResponse.json(
        { error: "No active employees with salary info found" },
        { status: 400 }
      );
    }

    const results = { created: 0, skipped: 0, errors: 0 };

    for (const employee of employees) {
      if (!employee.salaryInfo) {
        results.skipped++;
        continue;
      }

      // Check if payslip already exists for this period
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

        // Pro-rate basic + allowances if employee starts mid-month (MOM standard, working days)
        let proratedBasic = Number(salary.basicSalary);
        let proratedAllowances = Number(salary.allowances);
        if (employee.startDate) {
          const start = new Date(employee.startDate);
          const end = employee.endDate ? new Date(employee.endDate) : new Date(8640000000000000);
          if (start > payPeriodStart || end < payPeriodEnd) {
            const basicProrated = prorateMonthlySalary(
              Number(salary.basicSalary),
              start,
              end,
              payPeriodStart,
              payPeriodEnd,
            );
            const allowancesProrated = prorateMonthlySalary(
              Number(salary.allowances),
              start,
              end,
              payPeriodStart,
              payPeriodEnd,
            );
            proratedBasic = basicProrated.amount;
            proratedAllowances = allowancesProrated.amount;
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

        try {
          await emailPayslipToEmployee(created.id);
        } catch (err) {
          console.error(`Payslip email failed for ${created.id}:`, err);
        }

        results.created++;
      } catch (error) {
        console.error(`Error generating payslip for ${employee.id}:`, error);
        results.errors++;
      }
    }

    return NextResponse.json({
      message: `Payroll generated for ${month}/${year}`,
      ...results,
    });
  } catch (error) {
    console.error("Error generating payroll:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
