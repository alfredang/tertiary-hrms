// scripts/deactivate-test-accounts.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_EMAILS = [
  "admin@tertiaryinfotech.com",
  "staff@tertiaryinfotech.com",
  "staff2@tertiaryinfotech.com",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(dryRun ? "=== DRY RUN ===" : "=== DEACTIVATING TEST ACCOUNTS ===");
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

    if (emp.status === "INACTIVE") {
      console.log(`  Already INACTIVE — skipping`);
      continue;
    }

    if (!dryRun) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { status: "INACTIVE" },
      });
      console.log(`  ✓ Set to INACTIVE`);
    } else {
      console.log(`  [dry-run] Would set to INACTIVE`);
    }
    console.log("");
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
