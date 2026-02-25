import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(dryRun ? '=== DRY RUN ===' : '=== DELETING PAYSLIPS ===');
  console.log('');

  // Find all payslips
  const payslips = await prisma.payslip.findMany({
    include: {
      employee: { select: { name: true, email: true } },
    },
    orderBy: [{ payPeriodStart: 'asc' }, { employee: { name: 'asc' } }],
  });

  // Group by period
  const byPeriod: Record<string, typeof payslips> = {};
  for (const p of payslips) {
    const key = `${p.payPeriodStart.toISOString().slice(0, 7)}`;
    if (!byPeriod[key]) byPeriod[key] = [];
    byPeriod[key].push(p);
  }

  console.log(`Total payslips: ${payslips.length}`);
  for (const [period, items] of Object.entries(byPeriod)) {
    console.log(`\n  ${period}: ${items.length} payslips`);
    for (const p of items) {
      console.log(`    - ${p.employee.name} | Gross: $${p.grossSalary} | Net: $${p.netSalary} | Created: ${p.createdAt.toISOString().slice(0, 10)}`);
    }
  }

  console.log(`\n--- ALL ${payslips.length} payslips will be deleted ---`);

  if (dryRun) {
    console.log('\nDry run complete. Run without --dry-run to delete.');
    return;
  }

  const deleted = await prisma.payslip.deleteMany({});
  console.log(`\nDeleted ${deleted.count} payslips.`);
  console.log('Done! Payroll is clean — ready to regenerate.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
