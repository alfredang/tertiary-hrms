import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const yearArgIdx = process.argv.indexOf('--year');
  const sourceYear = yearArgIdx !== -1 && process.argv[yearArgIdx + 1]
    ? parseInt(process.argv[yearArgIdx + 1], 10)
    : new Date().getFullYear() - 1;
  const targetYear = sourceYear + 1;

  console.log(`\n=== Leave Year-End Rollover ===`);
  console.log(`Source year: ${sourceYear} → Target year: ${targetYear}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update DB)'}\n`);

  // Step 1: Ensure AL has carryOver: true
  const leaveTypes = await prisma.leaveType.findMany();
  for (const lt of leaveTypes) {
    const shouldCarryOver = lt.code === 'AL';
    if (lt.carryOver !== shouldCarryOver) {
      console.log(`[Fix] ${lt.name} (${lt.code}): carryOver ${lt.carryOver} → ${shouldCarryOver}`);
      if (!dryRun) {
        await prisma.leaveType.update({
          where: { id: lt.id },
          data: { carryOver: shouldCarryOver, maxCarryOver: 0 },
        });
      }
    }
  }

  // Step 2: Get all active employees
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, employeeId: true },
  });
  console.log(`Active employees: ${employees.length}\n`);

  // Step 3: Process rollover for each employee
  const summary: Array<{ employee: string; leaveType: string; unused: number; carried: number; warning?: string }> = [];

  for (const emp of employees) {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: emp.id, year: sourceYear },
      include: { leaveType: true },
    });

    for (const bal of balances) {
      if (!bal.leaveType.carryOver) continue;

      const entitlement = Number(bal.entitlement);
      const used = Number(bal.used);
      const pending = Number(bal.pending);
      const unused = Math.max(0, entitlement - used);
      const maxCarry = bal.leaveType.maxCarryOver;
      const carryAmount = maxCarry > 0 ? Math.min(unused, maxCarry) : unused;

      let warning: string | undefined;
      if (pending > 0) {
        warning = `${pending} days still pending`;
      }

      summary.push({
        employee: `${emp.name} (${emp.employeeId})`,
        leaveType: bal.leaveType.code,
        unused,
        carried: carryAmount,
        warning,
      });

      if (!dryRun && carryAmount > 0) {
        await prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: emp.id,
              leaveTypeId: bal.leaveTypeId,
              year: targetYear,
            },
          },
          create: {
            employeeId: emp.id,
            leaveTypeId: bal.leaveTypeId,
            year: targetYear,
            entitlement: bal.leaveType.defaultDays,
            used: 0,
            pending: 0,
            carriedOver: carryAmount,
          },
          update: {
            carriedOver: carryAmount,
          },
        });
      }
    }
  }

  // Step 4: Print summary
  console.log('--- Rollover Summary ---');
  console.log(`${'Employee'.padEnd(35)} ${'Type'.padEnd(6)} ${'Unused'.padEnd(8)} ${'Carried'.padEnd(8)} Warning`);
  console.log('-'.repeat(80));

  if (summary.length === 0) {
    console.log('No carry-over eligible balances found.');
  } else {
    for (const row of summary) {
      console.log(
        `${row.employee.padEnd(35)} ${row.leaveType.padEnd(6)} ${String(row.unused).padEnd(8)} ${String(row.carried).padEnd(8)} ${row.warning || ''}`
      );
    }
  }

  const totalCarried = summary.reduce((sum, r) => sum + r.carried, 0);
  console.log(`\nTotal days carried over: ${totalCarried}`);
  if (dryRun) {
    console.log('\n[DRY RUN] No changes were made. Run without --dry-run to apply.');
  } else {
    console.log('\nRollover complete. Changes applied to database.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
