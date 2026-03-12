import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, role: true, employee: { select: { name: true, employeeId: true, status: true } } },
    orderBy: { email: 'asc' }
  });
  console.log('=== All Users ===');
  for (const u of users) {
    const emp = u.employee
      ? `${u.employee.employeeId} - ${u.employee.name} (${u.employee.status})`
      : 'NO EMPLOYEE';
    console.log(`${u.email} | ${u.role} | ${emp}`);
  }
  console.log(`\nTotal: ${users.length}`);
}

main().finally(() => prisma.$disconnect());
