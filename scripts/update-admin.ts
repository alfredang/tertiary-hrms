import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function updateAdmin() {
  try {
    console.log("Updating admin user...");

    // First, delete the old angch@tertiaryinfotech.com user if it exists
    const existingUser = await prisma.user.findUnique({
      where: { email: "angch@tertiaryinfotech.com" },
      include: { employee: true },
    });

    if (existingUser) {
      console.log(`Removing old user: ${existingUser.email} (${existingUser.employee?.name})`);

      // Delete the old employee and user
      if (existingUser.employee) {
        await prisma.employee.delete({
          where: { id: existingUser.employee.id },
        });
      }
      await prisma.user.delete({
        where: { email: "angch@tertiaryinfotech.com" },
      });
      console.log("✓ Old user removed");
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash("***REMOVED***", 10);

    // Update the user with email admin@tertiaryinfotech.com
    const user = await prisma.user.update({
      where: {
        email: "admin@tertiaryinfotech.com",
      },
      data: {
        email: "angch@tertiaryinfotech.com",
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    console.log("✓ User updated successfully!");
    console.log("Email:", user.email);
    console.log("Role:", user.role);
    console.log("Password: ***REMOVED***");

    // Also update the employee record if needed
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
    });

    if (employee && employee.email !== user.email) {
      await prisma.employee.update({
        where: { userId: user.id },
        data: {
          email: "angch@tertiaryinfotech.com",
        },
      });
      console.log("✓ Employee email updated too!");
    }

    console.log("\n✅ All done! You can now login with:");
    console.log("Email: angch@tertiaryinfotech.com");
    console.log("Password: ***REMOVED***");
    console.log("Role: ADMIN");
  } catch (error) {
    console.error("Error updating admin:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdmin();
