import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createEmployeeSchema } from "@/lib/validations/employee";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export async function POST(req: NextRequest) {
  try {
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!["ADMIN", "HR"].includes(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden - only ADMIN and HR can add employees" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const validation = createEmployeeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { personalInfo, employmentInfo, salaryInfo } = validation.data;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: personalInfo.email },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Generate employee ID
    const lastEmployee = await prisma.employee.findFirst({
      orderBy: { employeeId: "desc" },
      select: { employeeId: true },
    });
    const lastNum = lastEmployee
      ? parseInt(lastEmployee.employeeId.replace("EMP", ""), 10)
      : 0;
    const employeeId = `EMP${String(lastNum + 1).padStart(3, "0")}`;

    const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || randomUUID().slice(0, 12);
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: personalInfo.email,
          password: hashedPassword,
          role: "STAFF",
        },
      });

      // Create employee with partial data
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeId,
          name: personalInfo.fullName.toUpperCase(),
          email: personalInfo.email,
          phone: personalInfo.phone || null,
          dateOfBirth: personalInfo.dateOfBirth
            ? new Date(personalInfo.dateOfBirth)
            : null,
          gender: personalInfo.gender || undefined,
          nationality: personalInfo.nationality || undefined,
          nric: personalInfo.nric || null,
          address: personalInfo.address || null,
          educationLevel: personalInfo.educationLevel || undefined,
          // Employment info (all optional with DB defaults)
          departmentId: employmentInfo?.departmentId || null,
          position: employmentInfo?.position || null,
          employmentType: employmentInfo?.employmentType || undefined,
          startDate: employmentInfo?.startDate
            ? new Date(employmentInfo.startDate)
            : null,
          endDate: employmentInfo?.endDate
            ? new Date(employmentInfo.endDate)
            : null,
          status: employmentInfo?.status || undefined,
        },
        include: { department: true },
      });

      // Create salary info if provided
      if (salaryInfo && (salaryInfo.basicSalary || salaryInfo.basicSalary === 0)) {
        await tx.salaryInfo.create({
          data: {
            employeeId: employee.id,
            basicSalary: salaryInfo.basicSalary ?? 0,
            allowances: salaryInfo.allowances ?? 0,
            bankName: salaryInfo.bankName || null,
            bankAccountNumber: salaryInfo.bankAccountNumber || null,
            payNow: salaryInfo.payNow || null,
            cpfApplicable: salaryInfo.cpfApplicable ?? true,
            cpfEmployeeRate: salaryInfo.cpfEmployeeRate ?? 20.0,
            cpfEmployerRate: salaryInfo.cpfEmployerRate ?? 17.0,
          },
        });
      }

      // Create leave balances for current year
      const leaveTypes = await tx.leaveType.findMany();
      const currentYear = new Date().getFullYear();
      for (const lt of leaveTypes) {
        await tx.leaveBalance.create({
          data: {
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

      return employee;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
