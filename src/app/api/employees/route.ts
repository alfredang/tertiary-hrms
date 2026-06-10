import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createEmployeeSchema } from "@/lib/validations/employee";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { provisionEmployeeFolder } from "@/lib/drive";

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

    const { personalInfo, employmentInfo, salaryInfo, role } = validation.data;
    const effectiveRole = role ?? "STAFF";

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: personalInfo.email },
      include: { employee: true },
    });
    if (existingUser?.employee) {
      return NextResponse.json(
        { error: "An employee profile for this email already exists" },
        { status: 409 }
      );
    }

    // Generate employee ID — interns get I####, everyone else gets E####.
    // Find numeric max to avoid string-sort issues (e.g. E0099 > E0100).
    const prefix = effectiveRole === "INTERN" ? "I" : "E";
    const allEmployees = await prisma.employee.findMany({
      select: { employeeId: true },
    });
    const maxNum = allEmployees.reduce((max, emp) => {
      // Match exactly: prefix immediately followed by digits to end (so "E0001" doesn't match prefix "EMP").
      const re = new RegExp(`^${prefix}(\\d+)$`);
      const m = emp.employeeId.match(re);
      if (!m) return max;
      const num = parseInt(m[1], 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const employeeId = `${prefix}${String(maxNum + 1).padStart(4, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      // Reuse existing User (Google OAuth sign-in) or create new one.
      // For interns, force roles to exactly ["INTERN"] — an intern is always an intern,
      // regardless of any role a prior OAuth-only user may have accumulated.
      let user;
      if (existingUser) {
        if (effectiveRole === "INTERN") {
          user = await tx.user.update({
            where: { id: existingUser.id },
            data: { roles: ["INTERN"] },
          });
        } else {
          user = existingUser;
        }
      } else {
        const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || randomUUID().slice(0, 12);
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);
        user = await tx.user.create({
          data: {
            email: personalInfo.email,
            password: hashedPassword,
            roles: [effectiveRole],
          },
        });
      }

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
          school: (personalInfo as any).school || null,
          // Employment info (all optional with DB defaults)
          departmentId: employmentInfo?.departmentId || null,
          position: employmentInfo?.position || null,
          employmentType: effectiveRole === "INTERN" ? "INTERN" : (employmentInfo?.employmentType || undefined),
          startDate: employmentInfo?.startDate
            ? new Date(employmentInfo.startDate)
            : null,
          endDate: employmentInfo?.endDate
            ? new Date(employmentInfo.endDate)
            : null,
          status: employmentInfo?.status || undefined,
          monthlyLeaveRate: employmentInfo?.monthlyLeaveRate ?? null,
          managerId: await resolveDefaultManagerId(
            (employmentInfo as any)?.managerId,
            personalInfo.email,
          ),
        },
        include: { department: true },
      });

      // Create salary info if provided (skip for interns)
      if (effectiveRole !== "INTERN" && salaryInfo && (salaryInfo.basicSalary || salaryInfo.basicSalary === 0)) {
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
        // Interns use internDefaultDays when set; staff use defaultDays
        const entitlement =
          effectiveRole === "INTERN" && lt.internDefaultDays > 0
            ? lt.internDefaultDays
            : lt.defaultDays;
        await tx.leaveBalance.create({
          data: {
            employeeId: employee.id,
            leaveTypeId: lt.id,
            year: currentYear,
            entitlement,
            carriedOver: 0,
            used: 0,
            pending: 0,
          },
        });
      }

      return employee;
    });

    // Respond immediately — Drive folder provisioning runs in the background
    provisionEmployeeFolder({
      employeeId: result.id,
      name: personalInfo.fullName,
      email: personalInfo.email,
    }).catch((err) => console.error(`Drive provisioning failed for employee ${result.id}:`, err));

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const DEFAULT_MANAGER_EMAIL = "tansc@tertiaryinfotech.com";

async function resolveDefaultManagerId(
  provided: string | undefined | null,
  newEmployeeEmail?: string,
): Promise<string | null> {
  if (provided) return provided;
  // Default to Tan Soik Ching — but never set a person as their own manager.
  const tsc = await prisma.employee.findFirst({
    where: { email: DEFAULT_MANAGER_EMAIL },
    select: { id: true, email: true },
  });
  if (!tsc) return null;
  if (newEmployeeEmail && newEmployeeEmail.toLowerCase() === tsc.email.toLowerCase()) return null;
  return tsc.id;
}
