import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePayEditor } from "@/lib/pay-edit-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RowSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().optional(),
  ordinaryWages: z.number().min(0),
  additionalWages: z.number().min(0),
  employeeCpf: z.number().min(0),
  employerCpf: z.number().min(0),
});

const BodySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  rows: z.array(RowSchema).min(1),
  /** Overwrite payslips that already exist for the period. */
  overwrite: z.boolean().optional().default(false),
  /** Drive id of the archived statement (parse route), stored on each payslip. */
  cpfSubmissionFileId: z.string().regex(/^[A-Za-z0-9_-]{10,}$/).nullish(),
});

// Pay-edit guardrail: only the admins may create or change payslips (src/lib/pay-edit-policy.ts).
async function isAuthorized(): Promise<boolean> {
  return (await requirePayEditor()) === null;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { month, year, rows, overwrite, cpfSubmissionFileId } = parsed.data;

    const payPeriodStart = new Date(year, month - 1, 1);
    const payPeriodEnd = new Date(year, month, 0);
    const paymentDate = new Date(year, month - 1, 28);

    const employees = await prisma.employee.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) } },
      include: { salaryInfo: true },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));

    const results = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const details: string[] = [];

    for (const row of rows) {
      const employee = byId.get(row.employeeId);
      if (!employee) {
        results.errors++;
        details.push(`${row.name ?? row.employeeId}: employee not found`);
        continue;
      }

      try {
        const grossSalary = row.ordinaryWages + row.additionalWages;

        // The CPF submission reports total wages, not the basic/allowance split.
        // Preserve the employee's configured allowance when it fits inside the
        // submitted gross so the payslip keeps its usual shape; otherwise treat
        // the whole amount as basic.
        const configuredAllowance = Number(employee.salaryInfo?.allowances ?? 0);
        const allowances = configuredAllowance > 0 && configuredAllowance <= grossSalary
          ? configuredAllowance
          : 0;
        const basicSalary = grossSalary - allowances;

        // CPF is taken verbatim from the submitted statement — that is the
        // point of generating payroll from the actual CPF filing.
        const cpfEmployee = row.employeeCpf;
        const cpfEmployer = row.employerCpf;
        const totalDeductions = cpfEmployee;
        const netSalary = grossSalary - totalDeductions;

        const data = {
          payPeriodStart,
          payPeriodEnd,
          paymentDate,
          basicSalary,
          allowances,
          overtime: 0,
          bonus: row.additionalWages,
          grossSalary,
          cpfEmployee,
          cpfEmployer,
          incomeTax: 0,
          otherDeductions: 0,
          totalDeductions,
          netSalary,
          status: "GENERATED" as const,
          cpfSubmissionFileId: cpfSubmissionFileId ?? null,
          // Figures as filed with the CPF Board: the month-end rule never touches it.
          source: "CPF",
          unpaidLeaveDays: 0,
          unpaidLeaveDeduction: 0,
          paybackDays: 0,
          paybackAmount: 0,
        };

        const existing = await prisma.payslip.findUnique({
          where: {
            employeeId_payPeriodStart_payPeriodEnd: {
              employeeId: employee.id,
              payPeriodStart,
              payPeriodEnd,
            },
          },
        });

        let payslipId: string;
        if (existing) {
          if (!overwrite) {
            results.skipped++;
            continue;
          }
          const updated = await prisma.payslip.update({
            where: { id: existing.id },
            data,
          });
          payslipId = updated.id;
          results.updated++;
        } else {
          const created = await prisma.payslip.create({
            data: {
              id: `ps_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              employeeId: employee.id,
              ...data,
            },
          });
          payslipId = created.id;
          results.created++;
        }
      } catch (error) {
        console.error(`Error creating payslip for ${row.employeeId}:`, error);
        results.errors++;
        details.push(
          `${employee.name}: ${error instanceof Error ? error.message : "failed"}`,
        );
      }
    }

    return NextResponse.json({
      message: `Payroll applied from CPF submission for ${month}/${year}`,
      ...results,
      details,
    });
  } catch (error) {
    console.error("Error applying CPF submission:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
