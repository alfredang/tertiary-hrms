import { PrismaClient, Role, Gender, EmploymentType, EmployeeStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { SG_PUBLIC_HOLIDAYS } from "../src/lib/sg-public-holidays";

const prisma = new PrismaClient();

async function main() {
  // Safety: require explicit flag to run seed (prevents accidental data wipe)
  if (!process.env.SEED_CONFIRM && process.argv[2] !== "--confirm") {
    console.error("⚠️  WARNING: This will DELETE all leave requests, expenses, payslips, and calendar events.");
    console.error("   Run with --confirm flag to proceed:");
    console.error("   npx tsx prisma/seed.ts --confirm");
    process.exit(1);
  }

  console.log("Seeding database...");

  // Create Departments (sequential to avoid connection issues)
  console.log("Creating departments...");
  const engDept = await prisma.department.upsert({
    where: { code: "ENG" },
    update: {},
    create: { id: randomUUID(), name: "Engineering", code: "ENG", description: "Software Development Team" },
  });
  const mktDept = await prisma.department.upsert({
    where: { code: "MKT" },
    update: {},
    create: { id: randomUUID(), name: "Marketing", code: "MKT", description: "Marketing and Communications" },
  });
  const hrDept = await prisma.department.upsert({
    where: { code: "HR" },
    update: {},
    create: { id: randomUUID(), name: "Human Resources", code: "HR", description: "HR and Administration" },
  });
  const finDept = await prisma.department.upsert({
    where: { code: "FIN" },
    update: {},
    create: { id: randomUUID(), name: "Finance", code: "FIN", description: "Finance and Accounting" },
  });
  const salesDept = await prisma.department.upsert({
    where: { code: "SALES" },
    update: {},
    create: { id: randomUUID(), name: "Sales", code: "SALES", description: "Sales and Business Development" },
  });
  const departments = [engDept, mktDept, hrDept, finDept, salesDept];
  console.log("Created departments:", departments.length);

  // Create Leave Types
  console.log("Creating leave types...");
  const annualLeave = await prisma.leaveType.upsert({
    where: { code: "AL" },
    update: { defaultDays: 7, internDefaultDays: 3, carryOver: true, maxCarryOver: 4 },
    create: { id: randomUUID(), name: "Annual Leave", code: "AL", defaultDays: 7, internDefaultDays: 3, carryOver: true, maxCarryOver: 4, description: "Paid annual leave" },
  });
  const sickLeave = await prisma.leaveType.upsert({
    where: { code: "SL" },
    update: {},
    create: { id: randomUUID(), name: "Sick Leave", code: "SL", defaultDays: 14, description: "Paid sick leave" },
  });
  const medicalLeave = await prisma.leaveType.upsert({
    where: { code: "MC" },
    update: { defaultDays: 14, paidDays: 7 },
    create: { id: randomUUID(), name: "Medical Leave", code: "MC", defaultDays: 14, paidDays: 7, description: "Medical leave", carryOver: false },
  });
  const compassionateLeave = await prisma.leaveType.upsert({
    where: { code: "CL" },
    update: {},
    create: { id: randomUUID(), name: "Compassionate Leave", code: "CL", defaultDays: 3, description: "Bereavement leave", carryOver: false },
  });
  const noPayLeave = await prisma.leaveType.upsert({
    where: { code: "NPL" },
    update: { defaultDays: 7 },
    create: { id: randomUUID(), name: "No Pay Leave", code: "NPL", defaultDays: 7, description: "Unpaid leave", paid: false, carryOver: false },
  });
  const accumulatedLeave = await prisma.leaveType.upsert({
    where: { code: "AL_OT" },
    update: {},
    create: { id: randomUUID(), name: "Accumulated Leave (OT)", code: "AL_OT", defaultDays: 0, description: "Overtime/weekend work accumulated leave", carryOver: true, paid: true },
  });
  const leaveTypes = [annualLeave, sickLeave, medicalLeave, compassionateLeave, noPayLeave, accumulatedLeave];
  console.log("Created leave types:", leaveTypes.length);

  // Seed Singapore Public Holidays — into both PublicHoliday and CalendarEvent tables
  console.log("Seeding Singapore public holidays...");
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear + 1]) {
    const holidays = SG_PUBLIC_HOLIDAYS[year] ?? [];
    for (const h of holidays) {
      const holidayDate = new Date(h.date);
      await prisma.publicHoliday.upsert({
        where: { date_countryCode: { date: holidayDate, countryCode: "SG" } },
        update: { name: h.name },
        create: { date: holidayDate, name: h.name, countryCode: "SG", year },
      });
      // Create CalendarEvent if none exists for this date+name
      const exists = await prisma.calendarEvent.findFirst({
        where: { type: "HOLIDAY", startDate: holidayDate, title: h.name },
      });
      if (!exists) {
        await prisma.calendarEvent.create({
          data: {
            title: h.name,
            description: "Singapore Public Holiday",
            startDate: holidayDate,
            endDate: holidayDate,
            allDay: true,
            type: "HOLIDAY",
            color: "#ef4444",
            createdById: null,
          },
        });
      }
    }
  }
  console.log("Seeded SG public holidays");

  // Create Expense Categories
  console.log("Creating expense categories...");
  await prisma.expenseCategory.upsert({
    where: { code: "CE" },
    update: {},
    create: { id: randomUUID(), name: "Client Entertainment", code: "CE", description: "Client meals and entertainment" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "TRV" },
    update: {},
    create: { id: randomUUID(), name: "Travel", code: "TRV", description: "Business travel expenses" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "OS" },
    update: {},
    create: { id: randomUUID(), name: "Office Supplies", code: "OS", description: "Office supplies and equipment" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "TRN" },
    update: {},
    create: { id: randomUUID(), name: "Training", code: "TRN", description: "Training and development" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "SW" },
    update: {},
    create: { id: randomUUID(), name: "Software & Subscriptions", code: "SW", description: "Software licenses and subscriptions" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "REF" },
    update: {},
    create: { id: randomUUID(), name: "Refreshments", code: "REF", description: "Refreshments and beverages for meetings or events" },
  });
  console.log("Created expense categories");

  // Create Admin User
  console.log("Creating admin user...");
  const seedPassword = process.env.SEED_PASSWORD || "Password123";
  const hashedPassword = await bcrypt.hash(seedPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@tertiaryinfotech.com" },
    update: {
      password: hashedPassword,
      roles: [Role.ADMIN],
    },
    create: {
      id: randomUUID(),
      email: "admin@tertiaryinfotech.com",
      password: hashedPassword,
      roles: [Role.ADMIN],
    },
  });

  // Create Admin Employee
  const adminEmployee = await prisma.employee.upsert({
    where: { employeeId: "EMP001" },
    update: {},
    create: {
      id: randomUUID(),
      userId: adminUser.id,
      employeeId: "EMP001",
      name: "ANG CHEW HOE",
      email: "admin@tertiaryinfotech.com",
      phone: "+65 9123 4567",
      dateOfBirth: new Date("1985-06-15"),
      gender: Gender.MALE,
      nationality: "Singaporean",
      departmentId: hrDept.id,
      position: "HR Director",
      employmentType: EmploymentType.FULL_TIME,
      startDate: new Date("2020-01-01"),
      status: EmployeeStatus.ACTIVE,
    },
  });

  await prisma.salaryInfo.upsert({
    where: { employeeId: adminEmployee.id },
    update: {},
    create: {
      id: randomUUID(),
      employeeId: adminEmployee.id,
      basicSalary: 12000,
      allowances: 1000,
      cpfApplicable: true,
      payNow: "+65 9123 4567",
    },
  });
  // Create leave balances for admin employee
  for (const leaveType of leaveTypes) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: adminEmployee.id,
          leaveTypeId: leaveType.id,
          year: currentYear,
        },
      },
      update: {},
      create: {
        id: randomUUID(),
        employeeId: adminEmployee.id,
        leaveTypeId: leaveType.id,
        year: currentYear,
        entitlement: leaveType.defaultDays,
        carriedOver: 0,
        used: 0,
        pending: 0,
      },
    });
  }
  console.log("Created admin user and employee");

  // Create Staff test user (staff@tertiaryinfotech.com / 123456)
  console.log("Creating staff test user...");
  const staffUser = await prisma.user.upsert({
    where: { email: "staff@tertiaryinfotech.com" },
    update: { password: hashedPassword, roles: [Role.STAFF] },
    create: {
      email: "staff@tertiaryinfotech.com",
      password: hashedPassword,
      roles: [Role.STAFF],
    },
  });

  const staffEmployee = await prisma.employee.upsert({
    where: { employeeId: "EMP007" },
    update: {},
    create: {
      userId: staffUser.id,
      employeeId: "EMP007",
      name: "STAFF TEST",
      email: "staff@tertiaryinfotech.com",
      phone: "+65 9000 0007",
      dateOfBirth: new Date("1995-03-20"),
      gender: Gender.FEMALE,
      nationality: "Singaporean",
      departmentId: engDept.id,
      position: "Software Engineer",
      employmentType: EmploymentType.FULL_TIME,
      startDate: new Date("2023-06-01"),
      status: EmployeeStatus.ACTIVE,
      managerId: adminEmployee.id,
    },
  });

  await prisma.salaryInfo.upsert({
    where: { employeeId: staffEmployee.id },
    update: {},
    create: {
      employeeId: staffEmployee.id,
      basicSalary: 6000,
      allowances: 300,
      cpfApplicable: true,
    },
  });

  for (const leaveType of leaveTypes) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: staffEmployee.id,
          leaveTypeId: leaveType.id,
          year: currentYear,
        },
      },
      update: { entitlement: leaveType.defaultDays },
      create: {
        employeeId: staffEmployee.id,
        leaveTypeId: leaveType.id,
        year: currentYear,
        entitlement: leaveType.defaultDays,
        carriedOver: 0,
        used: 0,
        pending: 0,
      },
    });
  }
  console.log("Created staff test user: staff@tertiaryinfotech.com");

  // Create sample employees
  console.log("Creating sample employees...");
  const sampleEmployees = [
    { email: "sarah.johnson@tertiaryinfotech.com", name: "JOHNSON SARAH", employeeId: "EMP002", position: "Senior Software Engineer", dept: engDept, salary: 8500, allowances: 500 },
    { email: "michael.chen@tertiaryinfotech.com", name: "CHEN MICHAEL", employeeId: "EMP003", position: "Marketing Manager", dept: mktDept, salary: 7200, allowances: 300 },
    { email: "emily.rodriguez@tertiaryinfotech.com", name: "RODRIGUEZ EMILY", employeeId: "EMP004", position: "HR Coordinator", dept: hrDept, salary: 5500, allowances: 200 },
    { email: "james.williams@tertiaryinfotech.com", name: "WILLIAMS JAMES", employeeId: "EMP005", position: "Sales Representative", dept: salesDept, salary: 5000, allowances: 400 },
    { email: "lisa.park@tertiaryinfotech.com", name: "PARK LISA", employeeId: "EMP006", position: "Financial Analyst", dept: finDept, salary: 6500, allowances: 250 },
  ];

  for (const emp of sampleEmployees) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: { password: hashedPassword },
      create: {
        id: randomUUID(),
        email: emp.email,
        password: hashedPassword,
        roles: [Role.STAFF],
      },
    });

    const employee = await prisma.employee.upsert({
      where: { employeeId: emp.employeeId },
      update: {},
      create: {
        id: randomUUID(),
        userId: user.id,
        employeeId: emp.employeeId,
        name: emp.name,
        email: emp.email,
        phone: "+65 9" + Math.floor(Math.random() * 10000000).toString().padStart(7, "0"),
        dateOfBirth: new Date(1990, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        gender: Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE,
        nationality: "Singaporean",
        departmentId: emp.dept.id,
        position: emp.position,
        employmentType: EmploymentType.FULL_TIME,
        startDate: new Date(2022, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        status: EmployeeStatus.ACTIVE,
        managerId: adminEmployee.id,
      },
    });

    await prisma.salaryInfo.upsert({
      where: { employeeId: employee.id },
      update: {},
      create: {
        id: randomUUID(),
        employeeId: employee.id,
        basicSalary: emp.salary,
        allowances: emp.allowances,
        cpfApplicable: true,
      },
    });

    // Create leave balances (last year carried over = 0, this year allocation = defaultDays)
    for (const leaveType of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            year: currentYear,
          },
        },
        update: {},
        create: {
          id: randomUUID(),
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          year: currentYear,
          entitlement: leaveType.defaultDays,
          carriedOver: 0,
          used: 0,
          pending: 0,
        },
      });
    }
    console.log(`Created employee: ${emp.name}`);
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
