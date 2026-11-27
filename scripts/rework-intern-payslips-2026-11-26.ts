/**
 * One-off (Alfred, 26 Nov 2026): re-work intern base-salary payslips with the hard-coded intern formula
 * (src/lib/intern-pay.ts): take-home = (working days − No Pay Leave − MC + Payback) × gross ÷ working
 * days, rounded down to a whole dollar; No Pay Leave and MC on their own lines.
 * Never touches a PAID payslip. Dry run by default; --apply writes. Run with TZ=UTC.
 */
import { prisma } from "@/lib/prisma";
import { isInternEmployee } from "@/lib/leave-policy";
import { refreshBaseSalaryPayslip, baseSalaryPayslip, loadUnpaidDays, loadPaybackDays } from "@/lib/payroll-month-end";
import { holidayKeys } from "@/lib/npl-payback-store";

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.payslip.findMany({
    where: { source: "BASE_SALARY", status: { not: "PAID" } },
    include: { employee: { include: { salaryInfo: true, user: { select: { roles: true } } } } },
    orderBy: { payPeriodStart: "asc" },
  });
  for (const p of rows) {
    const e = p.employee;
    if (!isInternEmployee({ employmentType: e.employmentType, roles: e.user?.roles }) || !e.salaryInfo) continue;
    const month = p.payPeriodStart.getMonth() + 1;
    const year = p.payPeriodStart.getFullYear();
    const holidays = await holidayKeys([year]);
    const u = await loadUnpaidDays(e.id, true, month, year, holidays);
    const r = baseSalaryPayslip({
      salary: e.salaryInfo, intern: true, dateOfBirth: e.dateOfBirth, startDate: e.startDate, endDate: e.endDate,
      month, year, unpaidDays: u.nplDays, mcDays: u.mcDays, paybackDays: await loadPaybackDays(e.id, month, year),
    });
    if (!r.ok) { console.log(`skip ${e.name} ${year}-${month}: ${r.reason}`); continue; }
    const f = r.payroll;
    console.log(`${e.name} ${year}-${String(month).padStart(2, "0")}: gross ${p.grossSalary} -> ${f.grossSalary}; ` +
      `NPL ${f.nplDays}d -${f.nplDeduction}, MC ${f.mcDays}d -${f.mcDeduction}, payback ${f.paybackDays}d +${f.paybackAmount}; ` +
      `take-home ${p.netSalary} -> ${f.netSalary}`);
    const changed = Number(p.netSalary) !== f.netSalary || Number(p.grossSalary) !== f.grossSalary || f.nplDays + f.mcDays > 0;
    if (apply && changed) {
      const res = await refreshBaseSalaryPayslip(e.id, month, year);
      if (!res.payslipUpdated) console.log(`   not updated: ${res.reason}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
