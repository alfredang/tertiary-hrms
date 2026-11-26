import { prisma } from "@/lib/prisma";

/**
 * The four pay figures shown for a staff member or intern (Alfred, 26 Nov 2026): gross pay,
 * CPF employee, CPF employer and take-home pay, from their latest payslip (staff: as filed
 * with CPF; interns: flat pay, no CPF). Admin-facing: never send it to a staff view of
 * someone else.
 */
export interface PaySummary {
  payslipId: string;
  /** "Oct 2026" */
  month: string;
  gross: number;
  cpfEmployee: number;
  cpfEmployer: number;
  takeHome: number;
  /** Unpaid days (No Pay Leave; MC too for interns) and paybacks on that payslip. */
  unpaidLeaveDays: number;
  /** The unpaid days split: No Pay Leave and MC (interns). Both 0 on older payslips. */
  nplDays: number;
  mcDays: number;
  paybackDays: number;
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Latest payslip figures per employee id. */
export async function latestPaySummaries(employeeIds: string[]): Promise<Record<string, PaySummary>> {
  if (employeeIds.length === 0) return {};
  const rows = await prisma.payslip.findMany({
    where: { employeeId: { in: employeeIds } },
    orderBy: [{ employeeId: "asc" }, { payPeriodStart: "desc" }],
    distinct: ["employeeId"],
    select: {
      id: true,
      employeeId: true,
      payPeriodStart: true,
      grossSalary: true,
      cpfEmployee: true,
      cpfEmployer: true,
      netSalary: true,
      unpaidLeaveDays: true,
      nplDays: true,
      mcDays: true,
      paybackDays: true,
    },
  });
  const out: Record<string, PaySummary> = {};
  for (const r of rows) {
    out[r.employeeId] = {
      payslipId: r.id,
      // Pay periods are stored at server-local midnight; read the month from the mid-month point.
      month: monthLabel(new Date(r.payPeriodStart.getTime() + 15 * 86400000)),
      gross: Number(r.grossSalary),
      cpfEmployee: Number(r.cpfEmployee),
      cpfEmployer: Number(r.cpfEmployer),
      takeHome: Number(r.netSalary),
      unpaidLeaveDays: Number(r.unpaidLeaveDays),
      nplDays: Number(r.nplDays),
      mcDays: Number(r.mcDays),
      paybackDays: Number(r.paybackDays),
    };
  }
  return out;
}
