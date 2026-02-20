import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function listUsers() {
  try {
    const users = await prisma.user.findMany({
      include: {
        employee: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    console.log("\n📋 All users in database:\n");
    users.forEach((user) => {
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`Employee: ${user.employee?.name} (${user.employee?.employeeId})`);
      console.log("---");
    });
  } catch (error) {
    console.error("Error listing users:", error);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();
