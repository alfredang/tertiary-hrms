import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

interface StaffRow {
  "/N": number;
  [key: string]: any;
}

// Map NRIC to known details
const staffMeta: Record<string, {
  position: string;
  dept: string;
  gender: "MALE" | "FEMALE";
  dob: string;
  emailOverride?: string;
  role: "ADMIN" | "STAFF";
}> = {
  "S6900362A": { position: "Managing Director", dept: "HR", gender: "FEMALE", dob: "1969-05-15", emailOverride: "tansc@tertiaryinfotech.com", role: "ADMIN" },
  "S1808997A": { position: "Director", dept: "ENG", gender: "MALE", dob: "1980-03-22", role: "ADMIN" },
  "S1784332Z": { position: "Senior Consultant", dept: "ENG", gender: "MALE", dob: "1978-08-10", role: "STAFF" },
  "S6917061G": { position: "Senior Consultant", dept: "ENG", gender: "FEMALE", dob: "1969-11-20", role: "STAFF" },
  "S9517320I": { position: "HR Executive", dept: "HR", gender: "FEMALE", dob: "1995-06-14", role: "STAFF" },
  "T0023903D": { position: "Software Engineer", dept: "ENG", gender: "MALE", dob: "2000-09-03", role: "STAFF" },
  "S8858232B": { position: "Business Analyst", dept: "FIN", gender: "FEMALE", dob: "1988-12-05", role: "STAFF" },
  "S7124866F": { position: "Admin Executive", dept: "HR", gender: "MALE", dob: "1971-07-18", role: "STAFF" },
  "T0415154I": { position: "Software Engineer", dept: "ENG", gender: "MALE", dob: "2004-01-15", role: "STAFF" },
  "T0531050J": { position: "Marketing Executive", dept: "MKT", gender: "FEMALE", dob: "2005-03-10", role: "STAFF" },
  "T0509766A": { position: "Software Engineer", dept: "ENG", gender: "MALE", dob: "2005-09-07", role: "STAFF" },
  "S8382919B": { position: "Accounts Executive", dept: "FIN", gender: "FEMALE", dob: "1983-04-19", role: "STAFF" },
  "S8181683B": { position: "Sales Manager", dept: "SALES", gender: "MALE", dob: "1981-06-30", role: "STAFF" },
};

function generateEmail(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length === 1) return `${parts[0]}@tertiaryinfotech.com`;
  const surname = parts[0];
  const initials = parts.slice(1).map(p => p[0]).join("");
  return `${surname}.${initials}@tertiaryinfotech.com`;
}

async function main() {
  // Check for --force flag to do a clean import (destructive)
  const forceMode = process.argv.includes("--force");

  console.log("=== Staff Import from staff.xlsx ===");
  console.log(`Mode: ${forceMode ? "FORCE (will delete existing data)" : "SAFE (upsert, preserves existing data)"}\n`);

  if (forceMode) {
    console.log("⚠️  FORCE MODE: Clearing all existing data...");
    await prisma.calendarEvent.deleteMany({});
    await prisma.payslip.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.leaveBalance.deleteMany({});
    await prisma.expenseClaim.deleteMany({});
    await prisma.salaryInfo.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
    console.log("Done clearing data\n");
  }

  // Read Excel
  const workbook = XLSX.readFile("staff.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<StaffRow>(sheet);
  console.log(`Found ${rows.length} staff records\n`);

  // Find column names (they have \r\n in them from Excel)
  const colKeys = Object.keys(rows[0]);
  const nricCol = colKeys.find(k => k.includes("CPF Account No"))!;
  const nameCol = colKeys.find(k => k.includes("Name of Employee"))!;
  const wagesCol = colKeys.find(k => k.includes("Ordinary") && k.includes("Wages"))!;
  const empCpfCol = colKeys.find(k => k.includes("Employee") && k.includes("CPF"))!;
  const erCpfCol = colKeys.find(k => k.includes("Employer") && k.includes("CPF"))!;

  // Ensure departments exist (upsert — won't overwrite your manual renames)
  const deptData = [
    { code: "ENG", name: "Engineering", description: "Software Development Team" },
    { code: "MKT", name: "Marketing", description: "Marketing and Communications" },
    { code: "HR", name: "Human Resources", description: "HR and Administration" },
    { code: "FIN", name: "Finance", description: "Finance and Accounting" },
    { code: "SALES", name: "Sales", description: "Sales and Business Development" },
  ];
  const departments: Record<string, any> = {};
  for (const d of deptData) {
    departments[d.code] = await prisma.department.upsert({
      where: { code: d.code },
      update: {}, // Don't overwrite existing department names/descriptions
      create: { id: randomUUID(), name: d.name, code: d.code, description: d.description },
    });
  }
  console.log("Departments ready\n");

  // Ensure leave types exist
  const ltData = [
    { code: "AL", name: "Annual Leave", defaultDays: 14, description: "Paid annual leave" },
    { code: "MC", name: "Medical Leave", defaultDays: 14, description: "Medical leave" },
    { code: "CL", name: "Compassionate Leave", defaultDays: 3, description: "Bereavement leave" },
    { code: "NPL", name: "No Pay Leave", defaultDays: 14, description: "Unpaid leave", paid: false },
  ];
  for (const lt of ltData) {
    await prisma.leaveType.upsert({
      where: { code: lt.code },
      update: {},
      create: { id: randomUUID(), ...lt },
    });
  }
  const leaveTypes = await prisma.leaveType.findMany();
  console.log(`Leave types ready: ${leaveTypes.length}\n`);

  // Ensure expense categories exist
  const expCatData = [
    { code: "CE", name: "Client Entertainment", description: "Client meals and entertainment" },
    { code: "TRV", name: "Travel", description: "Business travel expenses" },
    { code: "OS", name: "Office Supplies", description: "Office supplies and equipment" },
    { code: "TRN", name: "Training", description: "Training and development" },
    { code: "SW", name: "Software & Subscriptions", description: "Software licenses and subscriptions" },
  ];
  for (const ec of expCatData) {
    await prisma.expenseCategory.upsert({
      where: { code: ec.code },
      update: {},
      create: { id: randomUUID(), ...ec },
    });
  }

  const hashedPassword = await bcrypt.hash("123456", 12);
  const currentYear = new Date().getFullYear();

  console.log("Importing 13 real staff (upsert mode):\n");

  let adminEmployee: any = null;

  for (const row of rows) {
    const nric = String(row[nricCol]).trim();
    const fullName = String(row[nameCol]).trim();
    const wages = Number(row[wagesCol]) || 0;
    const employeeCpf = Number(row[empCpfCol]) || 0;
    const employerCpf = Number(row[erCpfCol]) || 0;

    const meta = staffMeta[nric];
    if (!meta) {
      console.warn(`  SKIP: No metadata for NRIC ${nric} (${fullName})`);
      continue;
    }

    const email = meta.emailOverride || generateEmail(fullName);
    const employeeId = `EMP${String(row["/N"]).padStart(3, "0")}`;

    // Upsert user (by email) — won't overwrite existing data
    const user = await prisma.user.upsert({
      where: { email },
      update: {}, // Don't overwrite — preserve any manual changes
      create: {
        id: randomUUID(),
        email,
        password: hashedPassword,
        role: meta.role,
      },
    });

    // Upsert employee (by email) — won't overwrite existing data
    const employee = await prisma.employee.upsert({
      where: { email },
      update: {}, // Don't overwrite — preserve any manual changes
      create: {
        id: randomUUID(),
        userId: user.id,
        employeeId,
        name: fullName.toUpperCase(),
        email,
        nric,
        dateOfBirth: new Date(meta.dob),
        gender: meta.gender,
        nationality: "Singaporean",
        departmentId: departments[meta.dept].id,
        position: meta.position,
        employmentType: "FULL_TIME",
        startDate: new Date("2024-01-01"),
        status: "ACTIVE",
      },
    });

    // Track first admin for manager assignment
    if (meta.role === "ADMIN" && !adminEmployee) {
      adminEmployee = employee;
    }

    // Upsert salary info
    const empRate = wages > 0 ? Math.round((employeeCpf / wages) * 10000) / 100 : 20;
    const erRate = wages > 0 ? Math.round((employerCpf / wages) * 10000) / 100 : 17;

    await prisma.salaryInfo.upsert({
      where: { employeeId: employee.id },
      update: {}, // Don't overwrite — preserve any manual changes
      create: {
        id: randomUUID(),
        employeeId: employee.id,
        basicSalary: wages,
        allowances: 0,
        cpfApplicable: true,
        cpfEmployeeRate: empRate,
        cpfEmployerRate: erRate,
      },
    });

    // Upsert leave balances
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: lt.id,
            year: currentYear,
          },
        },
        update: {}, // Don't overwrite — preserve any manual changes
        create: {
          id: randomUUID(),
          employeeId: employee.id,
          leaveTypeId: lt.id,
          year: currentYear,
          entitlement: lt.defaultDays,
          carriedOver: 0,
          used: 0,
          pending: 0,
        },
      });
    }

    console.log(`  ${employeeId} ${fullName.padEnd(30)} ${meta.role.padEnd(6)} ${meta.dept.padEnd(6)} $${String(wages).padStart(6)} ${email}`);
  }

  // Create test accounts for dev quick login (upsert)
  console.log("\nCreating test accounts for dev quick login (upsert)...");

  // TEST ADMIN
  const adminTestUser = await prisma.user.upsert({
    where: { email: "admin@tertiaryinfotech.com" },
    update: {},
    create: {
      id: randomUUID(),
      email: "admin@tertiaryinfotech.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });
  const adminTestEmp = await prisma.employee.upsert({
    where: { email: "admin@tertiaryinfotech.com" },
    update: {},
    create: {
      id: randomUUID(),
      userId: adminTestUser.id,
      employeeId: "EMP098",
      name: "TEST ADMIN",
      email: "admin@tertiaryinfotech.com",
      dateOfBirth: new Date("1990-01-01"),
      gender: "MALE",
      nationality: "Singaporean",
      departmentId: departments["HR"].id,
      position: "System Administrator",
      employmentType: "FULL_TIME",
      startDate: new Date("2024-01-01"),
      status: "ACTIVE",
    },
  });
  // Upsert leave balances for test admin
  for (const lt of leaveTypes) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: adminTestEmp.id,
          leaveTypeId: lt.id,
          year: currentYear,
        },
      },
      update: {},
      create: {
        id: randomUUID(),
        employeeId: adminTestEmp.id,
        leaveTypeId: lt.id,
        year: currentYear,
        entitlement: lt.defaultDays,
        carriedOver: 0,
        used: 0,
        pending: 0,
      },
    });
  }
  console.log("  EMP098 TEST ADMIN (dev login)  admin@tertiaryinfotech.com");

  // TEST STAFF
  const staffTestUser = await prisma.user.upsert({
    where: { email: "staff@tertiaryinfotech.com" },
    update: {},
    create: {
      id: randomUUID(),
      email: "staff@tertiaryinfotech.com",
      password: hashedPassword,
      role: "STAFF",
    },
  });
  const staffTestEmp = await prisma.employee.upsert({
    where: { email: "staff@tertiaryinfotech.com" },
    update: {},
    create: {
      id: randomUUID(),
      userId: staffTestUser.id,
      employeeId: "EMP099",
      name: "TEST STAFF",
      email: "staff@tertiaryinfotech.com",
      dateOfBirth: new Date("1995-01-01"),
      gender: "FEMALE",
      nationality: "Singaporean",
      departmentId: departments["ENG"].id,
      position: "Software Engineer",
      employmentType: "FULL_TIME",
      startDate: new Date("2024-01-01"),
      status: "ACTIVE",
      managerId: adminTestEmp.id,
    },
  });
  // Upsert leave balances for test staff
  for (const lt of leaveTypes) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: staffTestEmp.id,
          leaveTypeId: lt.id,
          year: currentYear,
        },
      },
      update: {},
      create: {
        id: randomUUID(),
        employeeId: staffTestEmp.id,
        leaveTypeId: lt.id,
        year: currentYear,
        entitlement: lt.defaultDays,
        carriedOver: 0,
        used: 0,
        pending: 0,
      },
    });
  }
  console.log("  EMP099 TEST STAFF (dev login)  staff@tertiaryinfotech.com");

  // Summary
  const totalEmployees = await prisma.employee.count();
  const totalUsers = await prisma.user.count();
  console.log(`\n=== Import Complete ===`);
  console.log(`Total employees: ${totalEmployees}`);
  console.log(`Total users: ${totalUsers}`);
  console.log(`\nLogin credentials (password: 123456):`);
  console.log(`  Admin: admin@tertiaryinfotech.com (TEST ADMIN)`);
  console.log(`  Staff: staff@tertiaryinfotech.com (TEST STAFF)`);
  console.log(`\n💡 To do a clean re-import (deletes all data), run:`);
  console.log(`   npx tsx scripts/import-staff.ts --force`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
