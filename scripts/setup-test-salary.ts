/**
 * Create salary info for test accounts so payroll tests work.
 * Safe: only touches EMP097, EMP098, EMP099 (test employees).
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/setup-test-salary.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_EMAILS = [
  "admin@tertiaryinfotech.com",
  "staff@tertiaryinfotech.com",
  "staff2@tertiaryinfotech.com",
];

async function main() {
  for (const email of TEST_EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: { include: { salaryInfo: true } } },
    });

    if (!user?.employee) {
      console.log(`❌ ${email}: No employee record — skipping`);
      continue;
    }

    if (user.employee.salaryInfo) {
      console.log(
        `✅ ${email}: Already has salary info (Basic=$${user.employee.salaryInfo.basicSalary})`
      );
      continue;
    }

    // Create salary info with reasonable test values
    const salary = await prisma.salaryInfo.create({
      data: {
        employeeId: user.employee.id,
        basicSalary: 3000.0,
        allowances: 200.0,
        cpfApplicable: true,
        cpfEmployeeRate: 20.0,
        cpfEmployerRate: 17.0,
      },
    });
    console.log(
      `✅ ${email}: Created salary info — Basic=$${salary.basicSalary}, Allowances=$${salary.allowances}`
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("Error:", e);
    prisma.$disconnect();
    process.exit(1);
  });
