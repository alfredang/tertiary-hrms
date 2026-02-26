// scripts/reactivate-test-accounts.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_EMAILS = [
  "admin@tertiaryinfotech.com",
  "staff@tertiaryinfotech.com",
  "staff2@tertiaryinfotech.com",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(dryRun ? "=== DRY RUN ===" : "=== REACTIVATING TEST ACCOUNTS ===");
  console.log("");

  for (const email of TEST_EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: { select: { id: true, name: true, status: true } } },
    });

    if (!user || !user.employee) {
      console.log(`⚠ ${email} — user/employee not found, skipping`);
      continue;
    }

    const emp = user.employee;
    console.log(`${email} (${emp.id}, ${emp.name})`);
    console.log(`  Current status: ${emp.status}`);

    if (emp.status === "ACTIVE") {
      console.log(`  Already ACTIVE — skipping`);
      continue;
    }

    if (!dryRun) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { status: "ACTIVE" },
      });
      console.log(`  ✓ Set to ACTIVE`);
    } else {
      console.log(`  [dry-run] Would set to ACTIVE`);
    }
    console.log("");
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
