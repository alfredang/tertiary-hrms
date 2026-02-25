import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  const log = (msg: string) => console.log(`${DRY_RUN ? "[DRY RUN] " : ""}${msg}`);

  log("=== Test Data Cleanup ===\n");

  // 1. Remove payslips outside Feb 2026
  const feb2026Start = new Date("2026-02-01");
  const feb2026End = new Date("2026-02-28T23:59:59.999Z");

  const oldPayslips = await prisma.payslip.findMany({
    where: {
      OR: [
        { payPeriodStart: { lt: feb2026Start } },
        { payPeriodStart: { gt: feb2026End } },
      ],
    },
    select: {
      id: true,
      payPeriodStart: true,
      payPeriodEnd: true,
      employee: { select: { name: true } },
    },
  });
  log(`Found ${oldPayslips.length} payslips outside Feb 2026:`);
  oldPayslips.forEach((p) =>
    log(
      `  - ${p.employee.name}: ${p.payPeriodStart.toISOString().slice(0, 10)} to ${p.payPeriodEnd.toISOString().slice(0, 10)}`
    )
  );

  if (!DRY_RUN && oldPayslips.length > 0) {
    const result = await prisma.payslip.deleteMany({
      where: { id: { in: oldPayslips.map((p) => p.id) } },
    });
    log(`Deleted ${result.count} old payslips.`);
  }

  // 2. Remove CANCELLED leave requests (test artifacts)
  const cancelledLeaves = await prisma.leaveRequest.findMany({
    where: { status: "CANCELLED" },
    select: {
      id: true,
      employee: { select: { name: true } },
      startDate: true,
      days: true,
    },
  });
  log(`\nFound ${cancelledLeaves.length} CANCELLED leave requests:`);
  cancelledLeaves.forEach((l) =>
    log(
      `  - ${l.employee.name}: ${l.startDate.toISOString().slice(0, 10)}, ${l.days} days`
    )
  );

  if (!DRY_RUN && cancelledLeaves.length > 0) {
    const result = await prisma.leaveRequest.deleteMany({
      where: { status: "CANCELLED" },
    });
    log(`Deleted ${result.count} cancelled leave requests.`);
  }

  // 3. Remove CANCELLED expense claims (test artifacts)
  const cancelledExpenses = await prisma.expenseClaim.findMany({
    where: { status: "CANCELLED" },
    select: {
      id: true,
      employee: { select: { name: true } },
      description: true,
      amount: true,
    },
  });
  log(`\nFound ${cancelledExpenses.length} CANCELLED expense claims:`);
  cancelledExpenses.forEach((e) =>
    log(`  - ${e.employee.name}: "${e.description}" $${e.amount}`)
  );

  if (!DRY_RUN && cancelledExpenses.length > 0) {
    const result = await prisma.expenseClaim.deleteMany({
      where: { status: "CANCELLED" },
    });
    log(`Deleted ${result.count} cancelled expense claims.`);
  }

  // 4. Remove test employees (if exist)
  const testEmails = [
    "test.cleanup@tertiaryinfotech.com",
    "test.mobile@tertiaryinfotech.com",
  ];
  log("");
  for (const email of testEmails) {
    const testUser = await prisma.user.findUnique({
      where: { email },
      include: { employee: true },
    });
    if (testUser) {
      log(
        `Found test user: ${testUser.email} (employee: ${testUser.employee?.name})`
      );
      if (!DRY_RUN) {
        if (testUser.employee) {
          await prisma.employee.delete({
            where: { id: testUser.employee.id },
          });
        }
        await prisma.user.delete({ where: { id: testUser.id } });
        log(`Deleted ${email} + employee + related records (cascade).`);
      }
    } else {
      log(`No test user found (${email}).`);
    }
  }

  // 5. Report possible test calendar events (don't auto-delete)
  const testCalendarEvents = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { title: { in: ["c", "a", "test", "Test"] } },
        { title: { startsWith: "test" } },
      ],
    },
    select: { id: true, title: true, type: true, startDate: true },
  });
  if (testCalendarEvents.length > 0) {
    log(
      `\n[INFO] Found ${testCalendarEvents.length} possible test calendar events (NOT deleting — review manually):`
    );
    testCalendarEvents.forEach((e) =>
      log(
        `  - "${e.title}" (${e.type}) ${e.startDate.toISOString().slice(0, 10)}`
      )
    );
  }

  // 6. Summary of what remains
  const remainingPayslips = await prisma.payslip.count();
  const remainingLeaves = await prisma.leaveRequest.count();
  const remainingExpenses = await prisma.expenseClaim.count();
  const remainingEmployees = await prisma.employee.count();
  log(`\n=== Remaining Records ===`);
  log(`  Payslips: ${remainingPayslips}`);
  log(`  Leave requests: ${remainingLeaves}`);
  log(`  Expense claims: ${remainingExpenses}`);
  log(`  Employees: ${remainingEmployees}`);

  log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
