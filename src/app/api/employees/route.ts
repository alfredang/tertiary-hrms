import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { personalInfoSchema, employmentInfoSchema, salaryInfoSchema } from "@/lib/validations/employee";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createEmployeeSchema = z.object({
  personalInfo: personalInfoSchema,
  employmentInfo: employmentInfoSchema,
  salaryInfo: salaryInfoSchema,
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (process.env.SKIP_AUTH !== "true") {
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

    const { personalInfo, employmentInfo, salaryInfo, password } = validation.data;

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

    const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || "123456";
    const hashedPassword = await bcrypt.hash(password || defaultPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: personalInfo.email,
          password: hashedPassword,
          role: "STAFF",
        },
      });

      // Create employee
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeId,
          name: personalInfo.fullName.toUpperCase(),
          email: personalInfo.email,
          phone: personalInfo.phone || null,
          dateOfBirth: new Date(personalInfo.dateOfBirth),
          gender: personalInfo.gender,
          nationality: personalInfo.nationality,
          nric: personalInfo.nric || null,
          address: personalInfo.address || null,
          educationLevel: personalInfo.educationLevel,
          departmentId: employmentInfo.departmentId,
          position: employmentInfo.position,
          employmentType: employmentInfo.employmentType,
          startDate: new Date(employmentInfo.startDate),
          endDate: employmentInfo.endDate ? new Date(employmentInfo.endDate) : null,
          status: employmentInfo.status,
        },
        include: { department: true },
      });

      // Create salary info
      await tx.salaryInfo.create({
        data: {
          employeeId: employee.id,
          basicSalary: salaryInfo.basicSalary,
          allowances: salaryInfo.allowances,
          bankName: salaryInfo.bankName || null,
          bankAccountNumber: salaryInfo.bankAccountNumber || null,
          payNow: salaryInfo.payNow || null,
          cpfApplicable: salaryInfo.cpfApplicable,
          cpfEmployeeRate: salaryInfo.cpfEmployeeRate,
          cpfEmployerRate: salaryInfo.cpfEmployerRate,
        },
      });

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
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Failed to create employee",
      },
      { status: 500 }
    );
  }
}
