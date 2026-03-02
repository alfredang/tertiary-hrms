import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(dryRun ? "=== DRY RUN ===" : "=== DELETING CANCELLED RECORDS ===");
  console.log("");

  // Find all CANCELLED leave requests
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: "CANCELLED" },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      leaveType: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${leaves.length} cancelled leave requests:`);
  for (const lr of leaves) {
    console.log(
      `  - ${lr.employee.name} | ${lr.leaveType.name} | ${lr.startDate.toISOString().slice(0, 10)} to ${lr.endDate.toISOString().slice(0, 10)} | ${lr.days} days | "${lr.reason || ""}"`
    );
  }
  console.log("");

  // Find all CANCELLED expense claims
  const expenses = await prisma.expenseClaim.findMany({
    where: { status: "CANCELLED" },
    include: {
      employee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${expenses.length} cancelled expense claims:`);
  for (const ec of expenses) {
    console.log(
      `  - ${ec.employee.name} | "${ec.description}" | $${ec.amount} | ${ec.expenseDate.toISOString().slice(0, 10)}`
    );
  }
  console.log("");

  const total = leaves.length + expenses.length;
  console.log(`Total to delete: ${total}`);

  if (total === 0) {
    console.log("Nothing to clean up!");
    return;
  }

  if (dryRun) {
    console.log("\nDry run complete. Run without --dry-run to delete.");
    return;
  }

  // Delete cancelled leaves
  if (leaves.length > 0) {
    const deleted = await prisma.leaveRequest.deleteMany({
      where: { status: "CANCELLED" },
    });
    console.log(`\nDeleted ${deleted.count} cancelled leave requests.`);
  }

  // Delete cancelled expenses
  if (expenses.length > 0) {
    const deleted = await prisma.expenseClaim.deleteMany({
      where: { status: "CANCELLED" },
    });
    console.log(`Deleted ${deleted.count} cancelled expense claims.`);
  }

  // Recalculate leave balances for affected employees
  const affectedEmployeeIds = [
    ...new Set(leaves.map((l) => l.employee.id)),
  ];
  for (const empId of affectedEmployeeIds) {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: empId },
    });
    for (const bal of balances) {
      const pendingAgg = await prisma.leaveRequest.aggregate({
        where: { employeeId: empId, leaveTypeId: bal.leaveTypeId, status: "PENDING" },
        _sum: { days: true },
      });
      const usedAgg = await prisma.leaveRequest.aggregate({
        where: { employeeId: empId, leaveTypeId: bal.leaveTypeId, status: "APPROVED" },
        _sum: { days: true },
      });
      const actualPending = Number(pendingAgg._sum.days || 0);
      const actualUsed = Number(usedAgg._sum.days || 0);

      if (Number(bal.pending) !== actualPending || Number(bal.used) !== actualUsed) {
        await prisma.leaveBalance.update({
          where: { id: bal.id },
          data: { pending: actualPending, used: actualUsed },
        });
        console.log(
          `Fixed employee ${empId} balance: pending ${bal.pending}->${actualPending}, used ${bal.used}->${actualUsed}`
        );
      }
    }
  }

  console.log("\nDone!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
