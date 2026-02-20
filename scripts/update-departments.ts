import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateDepartments() {
  try {
    console.log("Updating department names...\n");

    // Update Engineering to Operation
    const eng = await prisma.department.updateMany({
      where: { code: "ENG" },
      data: {
        name: "Operation",
        description: "Operations Team",
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Updated Engineering → Operation (${eng.count} records)`);

    // Update Sales to Admin
    const sales = await prisma.department.updateMany({
      where: { code: "SALES" },
      data: {
        name: "Admin",
        description: "Administration and Support",
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Updated Sales → Admin (${sales.count} records)`);

    console.log("\n✅ Department names updated successfully!");
  } catch (error) {
    console.error("Error updating departments:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateDepartments();
