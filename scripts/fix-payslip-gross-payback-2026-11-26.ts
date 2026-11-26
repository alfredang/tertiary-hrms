/**
 * One-off (Alfred, 26 Nov 2026): gross is the base pay only; a payback is added to take-home, not
 * gross. Payslips made before the fix carry the payback inside grossSalary (one Oct 2026 payslip:
 * $1,045.45). Take it out of gross; take-home, CPF and deductions are unchanged.
 * Dry run by default; --apply writes. Run with TZ=UTC.
 */
import { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.payslip.findMany({
    where: { paybackAmount: { gt: 0 } },
    include: { employee: { select: { name: true } } },
    orderBy: { payPeriodStart: "asc" },
  });
  for (const p of rows) {
    const gross = new Decimal(p.grossSalary.toString());
    const payback = new Decimal(p.paybackAmount.toString());
    const base = gross.minus(payback);
    const month = p.payPeriodStart.toISOString().slice(0, 7);
    // Old rule: net = gross − deductions (payback inside gross). Anything else is already fixed.
    if (!gross.minus(p.totalDeductions.toString()).equals(p.netSalary.toString())) {
      console.log(`skip  ${p.employee.name} ${month}: gross ${gross} already excludes payback (net ${p.netSalary})`);
      continue;
    }
    console.log(`${apply ? "fix " : "would fix"} ${p.employee.name} ${month} [${p.source}/${p.status}]: gross ${gross} -> ${base}, payback +${payback}, net ${p.netSalary} (unchanged)`);
    if (apply) await prisma.payslip.update({ where: { id: p.id }, data: { grossSalary: base.toNumber() } });
  }
  console.log(`${rows.length} payslip(s) with a payback`);
}

main().finally(() => prisma.$disconnect());
