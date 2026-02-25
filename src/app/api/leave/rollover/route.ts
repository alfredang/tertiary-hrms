import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Auth check
  if (process.env.SKIP_AUTH !== "true") {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { fromYear?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const fromYear = body.fromYear;
  if (!fromYear || typeof fromYear !== "number" || fromYear < 2020 || fromYear > 2100) {
    return NextResponse.json({ error: "Invalid fromYear" }, { status: 400 });
  }

  const targetYear = fromYear + 1;

  try {
    // Ensure AL has carryOver: true
    await prisma.leaveType.updateMany({
      where: { code: "AL" },
      data: { carryOver: true, maxCarryOver: 0 },
    });

    // Get all active employees
    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true },
    });

    const summary: Array<{
      employee: string;
      employeeId: string;
      leaveType: string;
      unused: number;
      carried: number;
      warning?: string;
    }> = [];

    for (const emp of employees) {
      const balances = await prisma.leaveBalance.findMany({
        where: { employeeId: emp.id, year: fromYear },
        include: { leaveType: true },
      });

      for (const bal of balances) {
        if (!bal.leaveType.carryOver) continue;

        const entitlement = Number(bal.entitlement);
        const used = Number(bal.used);
        const pending = Number(bal.pending);
        const unused = Math.max(0, entitlement - used);
        const maxCarry = bal.leaveType.maxCarryOver;
        const carryAmount = maxCarry > 0 ? Math.min(unused, maxCarry) : unused;

        let warning: string | undefined;
        if (pending > 0) {
          warning = `${pending} days still pending`;
        }

        summary.push({
          employee: emp.name,
          employeeId: emp.employeeId,
          leaveType: bal.leaveType.code,
          unused,
          carried: carryAmount,
          warning,
        });

        if (carryAmount > 0) {
          await prisma.leaveBalance.upsert({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: emp.id,
                leaveTypeId: bal.leaveTypeId,
                year: targetYear,
              },
            },
            create: {
              employeeId: emp.id,
              leaveTypeId: bal.leaveTypeId,
              year: targetYear,
              entitlement: bal.leaveType.defaultDays,
              used: 0,
              pending: 0,
              carriedOver: carryAmount,
            },
            update: {
              carriedOver: carryAmount,
            },
          });
        }
      }
    }

    const totalCarried = summary.reduce((sum, r) => sum + r.carried, 0);

    return NextResponse.json({
      success: true,
      fromYear,
      targetYear,
      totalCarried,
      employeesProcessed: employees.length,
      summary,
    });
  } catch (error) {
    console.error("Rollover error:", error);
    return NextResponse.json({ error: "Rollover failed" }, { status: 500 });
  }
}
