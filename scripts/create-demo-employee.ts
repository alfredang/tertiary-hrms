/**
 * Creates (or refreshes) a clearly-labelled demo employee for App Store review of
 * the native iOS app. Seeds leave balances, a sample leave request, and an expense
 * claim, payslip, timesheet entries, and admin approval counts so the reviewer
 * sees real content across all native-app tabs. Idempotent — safe to re-run.
 *
 *   DATABASE_URL=... DEMO_PASSWORD=... npx tsx scripts/create-demo-employee.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "appreview@tertiaryinfotech.com";
const PASSWORD = process.env.DEMO_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("DEMO_PASSWORD env var is required (the demo account's login password).");
  process.exit(1);
}
const YEAR = new Date().getFullYear();

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password: hash, roles: ["ADMIN", "HR", "MANAGER", "STAFF"] },
    create: { email: EMAIL, password: hash, roles: ["ADMIN", "HR", "MANAGER", "STAFF"] },
  });

  const employee = await prisma.employee.upsert({
    where: { userId: user.id },
    update: { status: "ACTIVE", name: "App Review", endDate: null },
    create: {
      userId: user.id,
      employeeId: "E9999",
      email: EMAIL,
      name: "App Review",
      position: "App Review Demo User",
      employmentType: "FULL_TIME",
      nationality: "Singaporean",
      gender: "OTHER",
      status: "ACTIVE",
      startDate: new Date(`${YEAR - 1}-01-01`),
      phone: "+6500000000",
      workdays: [1, 2, 3, 4, 5],
    },
  });

  await prisma.salaryInfo.upsert({
    where: { employeeId: employee.id },
    update: {
      basicSalary: 5200,
      allowances: 300,
      bankName: "Demo Bank",
      bankAccountNumber: "000-000-000",
      cpfApplicable: true,
      cpfEmployeeRate: 20,
      cpfEmployerRate: 17,
      payNow: EMAIL,
    },
    create: {
      employeeId: employee.id,
      basicSalary: 5200,
      allowances: 300,
      bankName: "Demo Bank",
      bankAccountNumber: "000-000-000",
      cpfApplicable: true,
      cpfEmployeeRate: 20,
      cpfEmployerRate: 17,
      payNow: EMAIL,
    },
  });

  // Leave balances for AL / MC so the dashboard shows numbers.
  const al = await prisma.leaveType.findUnique({ where: { code: "AL" } });
  const mc = await prisma.leaveType.findUnique({ where: { code: "MC" } });
  for (const [lt, ent, used] of [
    [al, 14, 3],
    [mc, 14, 1],
  ] as const) {
    if (!lt) continue;
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: lt.id, year: YEAR } },
      update: { entitlement: ent, used, pending: 0 },
      create: { employeeId: employee.id, leaveTypeId: lt.id, year: YEAR, entitlement: ent, used, pending: 0 },
    });
  }

  // A sample approved AL request (skip if one already exists).
  if (al) {
    const exists = await prisma.leaveRequest.findFirst({ where: { employeeId: employee.id, leaveTypeId: al.id } });
    if (!exists) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: al.id,
          startDate: new Date(`${YEAR}-03-10`),
          endDate: new Date(`${YEAR}-03-12`),
          days: 3,
          dayType: "FULL_DAY",
          status: "APPROVED",
          reason: "Family vacation",
          approvedAt: new Date(`${YEAR}-03-01`),
        },
      });
    }
  }

  // A sample expense claim.
  const cat = await prisma.expenseCategory.findFirst();
  if (cat) {
    const exists = await prisma.expenseClaim.findFirst({ where: { employeeId: employee.id } });
    if (!exists) {
      await prisma.expenseClaim.create({
        data: {
          employeeId: employee.id,
          categoryId: cat.id,
          description: "Team lunch (client meeting)",
          amount: 86.5,
          currency: "SGD",
          expenseDate: new Date(`${YEAR}-04-15`),
          status: "APPROVED",
          approvedAt: new Date(`${YEAR}-04-18`),
        },
      });
    }
  }

  const payPeriodStart = new Date(Date.UTC(YEAR, 4, 1));
  const payPeriodEnd = new Date(Date.UTC(YEAR, 4, 31));
  await prisma.payslip.upsert({
    where: {
      employeeId_payPeriodStart_payPeriodEnd: {
        employeeId: employee.id,
        payPeriodStart,
        payPeriodEnd,
      },
    },
    update: {
      paymentDate: new Date(Date.UTC(YEAR, 5, 5)),
      basicSalary: 5200,
      allowances: 300,
      overtime: 120,
      bonus: 250,
      grossSalary: 5870,
      cpfEmployee: 1040,
      cpfEmployer: 884,
      incomeTax: 0,
      otherDeductions: 0,
      totalDeductions: 1040,
      netSalary: 4830,
      status: "PAID",
    },
    create: {
      employeeId: employee.id,
      payPeriodStart,
      payPeriodEnd,
      paymentDate: new Date(Date.UTC(YEAR, 5, 5)),
      basicSalary: 5200,
      allowances: 300,
      overtime: 120,
      bonus: 250,
      grossSalary: 5870,
      cpfEmployee: 1040,
      cpfEmployer: 884,
      incomeTax: 0,
      otherDeductions: 0,
      totalDeductions: 1040,
      netSalary: 4830,
      status: "PAID",
    },
  });

  const monday = getMondayUTC(new Date());
  for (let i = 0; i < 5; i++) {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + i);
    await prisma.timesheetEntry.upsert({
      where: { employeeId_date: { employeeId: employee.id, date } },
      update: { hours: 8, otCredited: 0, status: "APPROVED", adminComment: "Seeded for App Review" },
      create: { employeeId: employee.id, date, hours: 8, otCredited: 0, status: "APPROVED", adminComment: "Seeded for App Review" },
    });
  }

  const pendingUser = await prisma.user.upsert({
    where: { email: "appreview.pending@tertiaryinfotech.com" },
    update: { roles: ["STAFF"] },
    create: { email: "appreview.pending@tertiaryinfotech.com", password: hash, roles: ["STAFF"] },
  });
  const pendingEmployee = await prisma.employee.upsert({
    where: { userId: pendingUser.id },
    update: { status: "ACTIVE", name: "App Review Pending Staff", endDate: null },
    create: {
      userId: pendingUser.id,
      employeeId: "E9998",
      email: "appreview.pending@tertiaryinfotech.com",
      name: "App Review Pending Staff",
      position: "Demo Staff",
      employmentType: "FULL_TIME",
      nationality: "Singaporean",
      gender: "OTHER",
      status: "ACTIVE",
      startDate: new Date(`${YEAR - 1}-02-01`),
      phone: "+6500000001",
      managerId: employee.id,
      managerIds: [employee.id],
      workdays: [1, 2, 3, 4, 5],
    },
  });

  if (al) {
    const pendingLeave = await prisma.leaveRequest.findFirst({
      where: { employeeId: pendingEmployee.id, leaveTypeId: al.id, status: "PENDING" },
    });
    if (!pendingLeave) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: pendingEmployee.id,
          leaveTypeId: al.id,
          startDate: new Date(`${YEAR}-07-07`),
          endDate: new Date(`${YEAR}-07-08`),
          days: 2,
          dayType: "FULL_DAY",
          status: "PENDING",
          reason: "Seeded pending leave for App Review approval count",
        },
      });
    }
  }

  if (cat) {
    const pendingClaim = await prisma.expenseClaim.findFirst({
      where: { employeeId: pendingEmployee.id, status: "PENDING" },
    });
    if (!pendingClaim) {
      await prisma.expenseClaim.create({
        data: {
          employeeId: pendingEmployee.id,
          categoryId: cat.id,
          description: "Seeded taxi claim for App Review approval count",
          amount: 24.8,
          currency: "SGD",
          expenseDate: new Date(`${YEAR}-06-10`),
          status: "PENDING",
        },
      });
    }
  }

  console.log("✅ Demo employee ready");
  console.log("   email:   ", EMAIL);
  console.log("   password:", PASSWORD);
  console.log("   employee:", employee.employeeId, employee.name);
  console.log("   role:    ADMIN / HR / MANAGER / STAFF");
}

function getMondayUTC(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
