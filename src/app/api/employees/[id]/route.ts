import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Authentication + authorization
    // Development mode: Skip authentication if SKIP_AUTH is enabled
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const isPrivileged = ["ADMIN", "HR", "MANAGER"].includes(session.user.role);
      const isSelf = session.user.employeeId === id;
      if (!isPrivileged && !isSelf) {
        return NextResponse.json(
          { error: "Forbidden - insufficient permissions" },
          { status: 403 }
        );
      }
    }
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

    const { personalInfo, employmentInfo, salaryInfo, roles } = validation.data;

    // 4. Check employee exists
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { salaryInfo: true, user: true },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // 5. Prevent self-deactivation (locking yourself out)
    if (employmentInfo?.status && employmentInfo.status !== "ACTIVE") {
      let currentUserId: string | undefined;
      if (!isDevAuthSkipped()) {
        const session = await auth();
        currentUserId = session?.user?.id;
      }
      if (currentUserId && employee.userId === currentUserId) {
        return NextResponse.json(
          { error: "You cannot change your own status — ask another admin" },
          { status: 403 }
        );
      }
    }

    // 5. Update in transaction for data consistency
    const updated = await prisma.$transaction(async (tx) => {
      // Helper: convert empty strings to undefined so Prisma skips them
      const emptyToUndefined = (val: string | undefined | null) =>
        val === "" ? undefined : val;

      // Prepare employee update data
      const employeeData: Prisma.EmployeeUpdateInput = {};
      if (personalInfo) {
        const { fullName, ...restPersonal } = personalInfo;
        Object.assign(employeeData, {
          ...restPersonal,
          // Nullable fields: convert "" to null to avoid unique constraint issues
          phone: emptyToUndefined(restPersonal.phone),
          nric: restPersonal.nric === "" ? null : restPersonal.nric,
          address: emptyToUndefined(restPersonal.address),
          ...(fullName && { name: fullName.toUpperCase() }),
          dateOfBirth: restPersonal.dateOfBirth
            ? new Date(restPersonal.dateOfBirth)
            : undefined,
        });
      }
      if (employmentInfo) {
        Object.assign(employeeData, {
          ...employmentInfo,
          // Don't set departmentId to empty string (FK violation)
          departmentId: emptyToUndefined(employmentInfo.departmentId),
          position: emptyToUndefined(employmentInfo.position),
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

      // Sync User.email and/or User.role if changed
      const userUpdates: Record<string, unknown> = {};
      if (personalInfo?.email && personalInfo.email !== employee.email) {
        userUpdates.email = personalInfo.email;
      }
      if (roles && JSON.stringify(roles.sort()) !== JSON.stringify([...(employee.user.roles ?? [])].sort())) {
        userUpdates.roles = roles;
      }
      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({
          where: { id: employee.userId },
          data: userUpdates,
        });
      }

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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let currentUserId: string | undefined;

    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!["ADMIN", "HR"].includes(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden - only ADMIN and HR can delete employees" },
          { status: 403 }
        );
      }
      currentUserId = session.user.id;
    }

    const { id } = await params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    if (currentUserId && employee.userId === currentUserId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Remove rows that reference this employee but don't cascade
      await tx.leaveRequest.deleteMany({
        where: { OR: [{ employeeId: id }, { approverId: id }] },
      });
      await tx.expenseClaim.deleteMany({
        where: { OR: [{ employeeId: id }, { approverId: id }] },
      });
      await tx.payslip.deleteMany({ where: { employeeId: id } });
      // OtEntry.approver is optional — null out instead of deleting the OT record
      await tx.otEntry.updateMany({
        where: { approverId: id },
        data: { approverId: null },
      });
      // Detach subordinates so the self-relation FK doesn't block deletion
      await tx.employee.updateMany({
        where: { managerId: id },
        data: { managerId: null },
      });

      // Cascades: Employee, SalaryInfo, LeaveBalance, Attendance,
      // OtEntry (employee side), Notification, Session, Account
      await tx.user.delete({ where: { id: employee.userId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
