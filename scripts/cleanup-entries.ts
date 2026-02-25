import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(dryRun ? '=== DRY RUN ===' : '=== DELETING RECORDS ===');
  console.log('');

  // Find ALL pending leave requests to identify the ones from screenshots
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      employee: { select: { name: true, email: true } },
      leaveType: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${leaveRequests.length} pending leave requests:`);
  for (const lr of leaveRequests) {
    console.log(`  - ID: ${lr.id} | ${lr.employee.name} (${lr.employee.email}) | ${lr.leaveType.name} | ${lr.startDate.toISOString().slice(0, 10)} to ${lr.endDate.toISOString().slice(0, 10)} | ${lr.days} days | Applied: ${lr.createdAt.toISOString().slice(0, 10)}`);
  }
  console.log('');

  // Find ALL pending expense claims
  const expenseClaims = await prisma.expenseClaim.findMany({
    where: { status: 'PENDING' },
    include: {
      employee: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${expenseClaims.length} pending expense claims:`);
  for (const ec of expenseClaims) {
    console.log(`  - ID: ${ec.id} | ${ec.employee.name} (${ec.employee.email}) | "${ec.description}" | $${ec.amount} | ${ec.expenseDate.toISOString().slice(0, 10)}`);
  }
  console.log('');

  // Identify the 3 leave requests from screenshots:
  // 1. TEST ADMIN - Medical Leave, 26 Feb 2026, 0.5 days
  // 2. TEST STAFF 2 - Annual Leave, 9 Mar 2026, 1 day (x2)
  const leaveToDelete = leaveRequests.filter((lr) => {
    const name = lr.employee.name.toUpperCase();
    const start = lr.startDate.toISOString().slice(0, 10);
    const days = Number(lr.days);

    if (name.includes('ADMIN') && lr.leaveType.code === 'MC' && start === '2026-02-26' && days === 0.5) return true;
    if (name.includes('STAFF 2') && lr.leaveType.code === 'AL' && start === '2026-03-09' && days === 1) return true;
    return false;
  });

  // Identify the 2 expense claims from screenshots:
  // 1. TEST ADMIN - "c", $1.00, 18 Feb 2026
  // 2. TEST STAFF - "test", $10.00, 23 Feb 2026
  const expenseToDelete = expenseClaims.filter((ec) => {
    const name = ec.employee.name.toUpperCase();
    const amount = Number(ec.amount);

    if (name.includes('ADMIN') && ec.description === 'c' && amount === 1) return true;
    if (name.includes('STAFF') && ec.description === 'test' && amount === 10) return true;
    return false;
  });

  console.log('--- RECORDS TO DELETE ---');
  console.log(`Leave requests (${leaveToDelete.length}):`);
  for (const lr of leaveToDelete) {
    console.log(`  ✗ ${lr.employee.name} | ${lr.leaveType.name} | ${lr.startDate.toISOString().slice(0, 10)} | ${lr.days} days`);
  }
  console.log(`Expense claims (${expenseToDelete.length}):`);
  for (const ec of expenseToDelete) {
    console.log(`  ✗ ${ec.employee.name} | "${ec.description}" | $${ec.amount} | ${ec.expenseDate.toISOString().slice(0, 10)}`);
  }

  const total = leaveToDelete.length + expenseToDelete.length;
  console.log(`\nTotal to delete: ${total} (expected 5)`);

  if (total !== 5) {
    console.log(`\n⚠️  WARNING: Expected 5 records but found ${total}. Review above.`);
  }

  if (dryRun) {
    console.log('\nDry run complete. Run without --dry-run to delete.');
    return;
  }

  // Delete
  const leaveIds = leaveToDelete.map((lr) => lr.id);
  const expenseIds = expenseToDelete.map((ec) => ec.id);

  if (leaveIds.length > 0) {
    const deleted = await prisma.leaveRequest.deleteMany({ where: { id: { in: leaveIds } } });
    console.log(`\nDeleted ${deleted.count} leave requests.`);
  }

  if (expenseIds.length > 0) {
    const deleted = await prisma.expenseClaim.deleteMany({ where: { id: { in: expenseIds } } });
    console.log(`Deleted ${deleted.count} expense claims.`);
  }

  console.log('\nDone! All test entries removed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
