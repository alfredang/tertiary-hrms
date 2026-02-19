import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateEmployeeSchema } from "@/lib/validations/employee";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authentication check
    // Development mode: Skip authentication if SKIP_AUTH is enabled
    if (process.env.SKIP_AUTH !== "true") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // 2. Authorization check - only ADMIN, HR, MANAGER can edit
      if (!["ADMIN", "HR", "MANAGER"].includes(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden - insufficient permissions" },
          { status: 403 }
        );
      }
    }

    const { id } = await params;
    const body = await req.json();

    // 3. Validate request body
    const validation = updateEmployeeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { personalInfo, employmentInfo, salaryInfo } = validation.data;

    // 4. Check employee exists
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { salaryInfo: true },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // 5. Update in transaction for data consistency
    const updated = await prisma.$transaction(async (tx) => {
      // Prepare employee update data
      const employeeData: any = {};
      if (personalInfo) {
        const { fullName, firstName, lastName, ...restPersonal } = personalInfo;
        // Split fullName into firstName and lastName
        let derivedFirstName = firstName;
        let derivedLastName = lastName;
        if (fullName) {
          const parts = fullName.trim().split(/\s+/);
          derivedFirstName = parts[0];
          derivedLastName = parts.slice(1).join(" ") || parts[0];
        }
        Object.assign(employeeData, {
          ...restPersonal,
          ...(derivedFirstName && { firstName: derivedFirstName }),
          ...(derivedLastName && { lastName: derivedLastName }),
          dateOfBirth: restPersonal.dateOfBirth
            ? new Date(restPersonal.dateOfBirth)
            : undefined,
        });
      }
      if (employmentInfo) {
        Object.assign(employeeData, {
          ...employmentInfo,
          startDate: employmentInfo.startDate
            ? new Date(employmentInfo.startDate)
            : undefined,
          endDate: employmentInfo.endDate
            ? new Date(employmentInfo.endDate)
            : null,
        });
      }

      // Update employee table
      const updatedEmployee = await tx.employee.update({
        where: { id },
        data: {
          ...employeeData,
          updatedAt: new Date(),
        },
        include: {
          department: true,
          salaryInfo: true,
          leaveBalances: {
            where: { year: new Date().getFullYear() },
            include: { leaveType: true },
          },
        },
      });

      // Update salary info if provided
      if (salaryInfo && employee.salaryInfo) {
        await tx.salaryInfo.update({
          where: { employeeId: id },
          data: {
            ...salaryInfo,
            updatedAt: new Date(),
          },
        });
      } else if (salaryInfo && !employee.salaryInfo) {
        // Create salary info if it doesn't exist
        // Filter out undefined values so Prisma Decimal fields get proper defaults
        const definedSalaryInfo = Object.fromEntries(
          Object.entries(salaryInfo).filter(([, v]) => v !== undefined)
        );
        await tx.salaryInfo.create({
          data: {
            id: `sal_${Date.now()}`,
            employeeId: id,
            basicSalary: 0,
            allowances: 0,
            effectiveDate: new Date(),
            ...definedSalaryInfo,
          },
        });
      }

      return updatedEmployee;
    });

    // 6. Return updated employee
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Failed to update employee",
      },
      { status: 500 }
    );
  }
}
