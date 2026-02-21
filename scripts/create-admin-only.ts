import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    console.log("Creating admin user...");

    // Check if HR department exists, if not create it
    let hrDept = await prisma.department.findUnique({
      where: { code: "HR" },
    });

    if (!hrDept) {
      hrDept = await prisma.department.create({
        data: {
          id: randomUUID(),
          name: "Human Resources",
          code: "HR",
          description: "HR and Administration",
          updatedAt: new Date(),
        },
      });
      console.log("✓ Created HR department");
    }

    // Hash password from environment variable
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      throw new Error("ADMIN_PASSWORD environment variable is required");
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user first
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: "angch@tertiaryinfotech.com",
        password: hashedPassword,
        role: "ADMIN",
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created user");

    // Create employee
    const employee = await prisma.employee.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        employeeId: "EMP001",
        name: "ANG ALFRED",
        email: "angch@tertiaryinfotech.com",
        phone: "+65 9123 4567",
        dateOfBirth: new Date("1985-06-15"),
        gender: "MALE",
        nationality: "Singaporean",
        departmentId: hrDept.id,
        position: "HR Director",
        employmentType: "FULL_TIME",
        startDate: new Date("2020-01-01"),
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created employee");

    console.log("\n✅ Admin user created successfully!");
    console.log("Email: angch@tertiaryinfotech.com");
    console.log("Role: ADMIN");
    console.log("Employee ID: EMP001");
  } catch (error) {
    console.error("Error creating admin:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
