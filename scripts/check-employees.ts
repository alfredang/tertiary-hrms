import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkEmployees() {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        OR: [
          { employeeId: "EMP001" },
          { employeeId: "EMP000" },
        ],
      },
    });

    console.log("\n📋 Admin employees:\n");
    employees.forEach((emp) => {
      console.log(`ID: ${emp.id}`);
      console.log(`Employee ID: ${emp.employeeId}`);
      console.log(`Name: ${emp.name}`);
      console.log(`Email: ${emp.email}`);
      console.log("---");
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmployees();
