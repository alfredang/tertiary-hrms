/**
 * Database verification script for QA testing.
 * Read-only — does NOT modify any data.
 * Run: npx tsx scripts/verify-db.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const testEmails = [
    "admin@tertiaryinfotech.com",
    "staff@tertiaryinfotech.com",
    "staff2@tertiaryinfotech.com",
  ];

  // === TEST ACCOUNTS ===
  console.log("=== TEST ACCOUNTS ===");
  for (const email of testEmails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: { include: { department: true } } },
    });
    if (user) {
      const hasPassword = user.password.length > 0;
      const empName = user.employee?.name || "NONE";
      const empId = user.employee?.employeeId || "N/A";
      const dept = user.employee?.department?.name || "N/A";
      console.log(
        `  ✅ ${email} | Role: ${user.role} | HasPassword: ${hasPassword} | Employee: ${empName} (${empId}) | Dept: ${dept}`
      );
    } else {
      console.log(`  ❌ ${email} | NOT FOUND`);
    }
  }

  // === LEAVE BALANCES FOR 2026 ===
  console.log("\n=== LEAVE BALANCES FOR 2026 ===");
  for (const email of ["staff@tertiaryinfotech.com", "staff2@tertiaryinfotech.com"]) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: true },
    });
    if (!user?.employee) {
      console.log(`  ❌ ${email}: No employee record`);
      continue;
    }
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: user.employee.id, year: 2026 },
      include: { leaveType: true },
    });
    console.log(
      `  📋 ${email} (${user.employee.name}) — ${balances.length} leave balances:`
    );
    for (const b of balances) {
      console.log(
        `    ${b.leaveType.name} (${b.leaveType.code}): entitlement=${b.entitlement}, used=${b.used}, pending=${b.pending}, carried=${b.carriedOver}`
      );
    }
    if (balances.length === 0) {
      console.log("    ⚠️  NO LEAVE BALANCES — leave tests will fail!");
    }
  }

  // === SALARY INFO ===
  console.log("\n=== SALARY INFO ===");
  for (const email of testEmails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: { include: { salaryInfo: true } } },
    });
    if (user?.employee?.salaryInfo) {
      console.log(
        `  ✅ ${email}: Basic=$${user.employee.salaryInfo.basicSalary}, CPF=${user.employee.salaryInfo.cpfApplicable}`
      );
    } else {
      console.log(
        `  ⚠️  ${email}: No salary info — payroll tests may skip this employee`
      );
    }
  }

  // === EXPENSE CATEGORIES ===
  const categories = await prisma.expenseCategory.findMany();
  console.log(`\n=== EXPENSE CATEGORIES: ${categories.length} found ===`);
  for (const c of categories) {
    console.log(`  ${c.name} (${c.code}) — requiresReceipt: ${c.requiresReceipt}`);
  }
  if (categories.length === 0) {
    console.log("  ❌ NO CATEGORIES — expense tests will fail!");
  }

  // === DEPARTMENTS ===
  const depts = await prisma.department.findMany();
  console.log(`\n=== DEPARTMENTS: ${depts.length} found ===`);
  for (const d of depts) {
    console.log(`  ${d.name} (${d.code})`);
  }

  // === LEAVE TYPES ===
  const leaveTypes = await prisma.leaveType.findMany();
  console.log(`\n=== LEAVE TYPES: ${leaveTypes.length} found ===`);
  for (const lt of leaveTypes) {
    console.log(`  ${lt.name} (${lt.code}) — ${lt.defaultDays} days`);
  }

  // === TOTALS ===
  const userCount = await prisma.user.count();
  const empCount = await prisma.employee.count();
  console.log(`\n=== TOTALS: ${userCount} users, ${empCount} employees ===`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("Error:", e);
    prisma.$disconnect();
    process.exit(1);
  });
