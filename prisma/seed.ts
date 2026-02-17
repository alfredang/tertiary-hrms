import { PrismaClient, Role, Gender, EmploymentType, EmployeeStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create Departments (sequential to avoid connection issues)
  console.log("Creating departments...");
  const engDept = await prisma.department.upsert({
    where: { code: "ENG" },
    update: {},
    create: { name: "Engineering", code: "ENG", description: "Software Development Team" },
  });
  const mktDept = await prisma.department.upsert({
    where: { code: "MKT" },
    update: {},
    create: { name: "Marketing", code: "MKT", description: "Marketing and Communications" },
  });
  const hrDept = await prisma.department.upsert({
    where: { code: "HR" },
    update: {},
    create: { name: "Human Resources", code: "HR", description: "HR and Administration" },
  });
  const finDept = await prisma.department.upsert({
    where: { code: "FIN" },
    update: {},
    create: { name: "Finance", code: "FIN", description: "Finance and Accounting" },
  });
  const salesDept = await prisma.department.upsert({
    where: { code: "SALES" },
    update: {},
    create: { name: "Sales", code: "SALES", description: "Sales and Business Development" },
  });
  const departments = [engDept, mktDept, hrDept, finDept, salesDept];
  console.log("Created departments:", departments.length);

  // Create Leave Types
  console.log("Creating leave types...");
  const annualLeave = await prisma.leaveType.upsert({
    where: { code: "AL" },
    update: {},
    create: { name: "Annual Leave", code: "AL", defaultDays: 14, description: "Paid annual leave" },
  });
  const sickLeave = await prisma.leaveType.upsert({
    where: { code: "SL" },
    update: {},
    create: { name: "Sick Leave", code: "SL", defaultDays: 14, description: "Paid sick leave" },
  });
  const medicalLeave = await prisma.leaveType.upsert({
    where: { code: "MC" },
    update: {},
    create: { name: "Medical Leave", code: "MC", defaultDays: 60, description: "Extended medical leave" },
  });
  const compassionateLeave = await prisma.leaveType.upsert({
    where: { code: "CL" },
    update: {},
    create: { name: "Compassionate Leave", code: "CL", defaultDays: 3, description: "Bereavement leave" },
  });
  const leaveTypes = [annualLeave, sickLeave, medicalLeave, compassionateLeave];
  console.log("Created leave types:", leaveTypes.length);

  // Create Expense Categories
  console.log("Creating expense categories...");
  const clientEntertainment = await prisma.expenseCategory.upsert({
    where: { code: "CE" },
    update: {},
    create: { name: "Client Entertainment", code: "CE", description: "Client meals and entertainment" },
  });
  const travel = await prisma.expenseCategory.upsert({
    where: { code: "TRV" },
    update: {},
    create: { name: "Travel", code: "TRV", description: "Business travel expenses" },
  });
  const officeSupplies = await prisma.expenseCategory.upsert({
    where: { code: "OS" },
    update: {},
    create: { name: "Office Supplies", code: "OS", description: "Office supplies and equipment" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "TRN" },
    update: {},
    create: { name: "Training", code: "TRN", description: "Training and development" },
  });
  await prisma.expenseCategory.upsert({
    where: { code: "SW" },
    update: {},
    create: { name: "Software & Subscriptions", code: "SW", description: "Software licenses and subscriptions" },
  });
  console.log("Created expense categories");

  // Create Admin User
  console.log("Creating admin user...");
  const hashedPassword = await bcrypt.hash("Tertiary@888", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@tertiaryinfotech.com" },
    update: {
      password: hashedPassword,
      role: Role.ADMIN,
    },
    create: {
      email: "admin@tertiaryinfotech.com",
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  // Create Admin Employee
  const adminEmployee = await prisma.employee.upsert({
    where: { employeeId: "EMP001" },
    update: {},
    create: {
      userId: adminUser.id,
      employeeId: "EMP001",
      firstName: "Alfred",
      lastName: "Ang",
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
      employeeId: adminEmployee.id,
      basicSalary: 12000,
      allowances: 1000,
      cpfApplicable: true,
    },
  });
  console.log("Created admin user and employee");

  // Create sample employees
  console.log("Creating sample employees...");
  const sampleEmployees = [
    { email: "sarah.johnson@tertiaryinfotech.com", firstName: "Sarah", lastName: "Johnson", employeeId: "EMP002", position: "Senior Software Engineer", dept: engDept, salary: 8500, allowances: 500 },
    { email: "michael.chen@tertiaryinfotech.com", firstName: "Michael", lastName: "Chen", employeeId: "EMP003", position: "Marketing Manager", dept: mktDept, salary: 7200, allowances: 300 },
    { email: "emily.rodriguez@tertiaryinfotech.com", firstName: "Emily", lastName: "Rodriguez", employeeId: "EMP004", position: "HR Coordinator", dept: hrDept, salary: 5500, allowances: 200 },
    { email: "james.williams@tertiaryinfotech.com", firstName: "James", lastName: "Williams", employeeId: "EMP005", position: "Sales Representative", dept: salesDept, salary: 5000, allowances: 400 },
    { email: "lisa.park@tertiaryinfotech.com", firstName: "Lisa", lastName: "Park", employeeId: "EMP006", position: "Financial Analyst", dept: finDept, salary: 6500, allowances: 250 },
  ];

  const createdEmployees: any[] = [];
  const currentYear = new Date().getFullYear();

  for (const emp of sampleEmployees) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        email: emp.email,
        password: hashedPassword,
        role: Role.STAFF,
      },
    });

    const employee = await prisma.employee.upsert({
      where: { employeeId: emp.employeeId },
      update: {},
      create: {
        userId: user.id,
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
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
    createdEmployees.push(employee);

    await prisma.salaryInfo.upsert({
      where: { employeeId: employee.id },
      update: {},
      create: {
        employeeId: employee.id,
        basicSalary: emp.salary,
        allowances: emp.allowances,
        cpfApplicable: true,
      },
    });

    // Create leave balances
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
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          year: currentYear,
          entitlement: leaveType.defaultDays,
        },
      });
    }
    console.log(`Created employee: ${emp.firstName} ${emp.lastName}`);
  }

  // Create sample leave requests
  console.log("Creating sample leave requests...");
  const jamesEmployee = createdEmployees.find((e) => e.employeeId === "EMP005")!;
  const sarahEmployee = createdEmployees.find((e) => e.employeeId === "EMP002")!;
  const michaelEmployee = createdEmployees.find((e) => e.employeeId === "EMP003")!;

  await prisma.leaveRequest.create({
    data: {
      employeeId: jamesEmployee.id,
      leaveTypeId: annualLeave.id,
      startDate: new Date("2025-01-20"),
      endDate: new Date("2025-01-24"),
      days: 5,
      reason: "Family vacation",
      status: "APPROVED",
      approverId: adminEmployee.id,
      approvedAt: new Date("2025-01-15"),
    },
  });

  await prisma.leaveRequest.create({
    data: {
      employeeId: sarahEmployee.id,
      leaveTypeId: sickLeave.id,
      startDate: new Date("2025-01-27"),
      endDate: new Date("2025-01-28"),
      days: 2,
      reason: "Medical appointment",
      status: "PENDING",
    },
  });

  // Create sample expense claims
  console.log("Creating sample expense claims...");
  await prisma.expenseClaim.create({
    data: {
      employeeId: michaelEmployee.id,
      categoryId: clientEntertainment.id,
      description: "Client Dinner - TechCorp",
      amount: 285.50,
      expenseDate: new Date("2025-01-15"),
      status: "PENDING",
    },
  });

  await prisma.expenseClaim.create({
    data: {
      employeeId: sarahEmployee.id,
      categoryId: travel.id,
      description: "Conference Travel - SF",
      amount: 1250,
      expenseDate: new Date("2025-01-10"),
      status: "APPROVED",
      approverId: adminEmployee.id,
      approvedAt: new Date("2025-01-12"),
    },
  });

  await prisma.expenseClaim.create({
    data: {
      employeeId: jamesEmployee.id,
      categoryId: officeSupplies.id,
      description: "Office Supplies",
      amount: 87.25,
      expenseDate: new Date("2025-01-18"),
      status: "PAID",
      approverId: adminEmployee.id,
      approvedAt: new Date("2025-01-19"),
      paidAt: new Date("2025-01-20"),
    },
  });

  // Create sample payslips
  console.log("Creating sample payslips...");
  const payPeriodStart = new Date("2025-01-01");
  const payPeriodEnd = new Date("2025-01-31");

  for (const employee of createdEmployees) {
    const salaryInfo = await prisma.salaryInfo.findUnique({
      where: { employeeId: employee.id },
    });

    if (salaryInfo) {
      const basicSalary = Number(salaryInfo.basicSalary);
      const allowances = Number(salaryInfo.allowances);
      const grossSalary = basicSalary + allowances;
      const cpfEmployee = Math.round(grossSalary * 0.20);
      const cpfEmployer = Math.round(grossSalary * 0.17);
      const incomeTax = Math.round(grossSalary * 0.15);
      const totalDeductions = cpfEmployee + incomeTax;
      const netSalary = grossSalary - totalDeductions;

      await prisma.payslip.upsert({
        where: {
          employeeId_payPeriodStart_payPeriodEnd: {
            employeeId: employee.id,
            payPeriodStart,
            payPeriodEnd,
          },
        },
        update: {},
        create: {
          employeeId: employee.id,
          payPeriodStart,
          payPeriodEnd,
          paymentDate: new Date("2025-01-31"),
          basicSalary,
          allowances,
          grossSalary,
          cpfEmployee,
          cpfEmployer,
          incomeTax,
          totalDeductions,
          netSalary,
          status: "PAID",
        },
      });
    }
  }

  // Create calendar events
  console.log("Creating calendar events...");
  await prisma.calendarEvent.createMany({
    data: [
      { title: "Chinese New Year", startDate: new Date("2025-01-29"), endDate: new Date("2025-01-30"), allDay: true, type: "HOLIDAY", color: "#ef4444" },
      { title: "Team Meeting", startDate: new Date("2025-02-03T10:00:00"), endDate: new Date("2025-02-03T11:00:00"), allDay: false, type: "MEETING", color: "#3b82f6" },
      { title: "New Employee Orientation", startDate: new Date("2025-02-10T09:00:00"), endDate: new Date("2025-02-10T17:00:00"), allDay: false, type: "TRAINING", color: "#a855f7" },
      { title: "Company Town Hall", startDate: new Date("2025-02-14T14:00:00"), endDate: new Date("2025-02-14T16:00:00"), allDay: false, type: "COMPANY_EVENT", color: "#22c55e" },
    ],
  });

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
