import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "feminajasminismail@gmail.com";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
    });
    console.log(`Updated existing user ${updated.email} -> role ${updated.role}`);
  } else {
    const created = await prisma.user.create({
      data: { email, role: "ADMIN" },
    });
    console.log(`Created user ${created.email} with role ${created.role}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
