import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { isDevAuthSkipped } from "@/lib/dev-auth";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const leaveTypes = await prisma.leaveType.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(leaveTypes);
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, defaultDays, internDefaultDays, paidDays, carryOver, maxCarryOver } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof defaultDays === "number" && defaultDays >= 0) data.defaultDays = defaultDays;
  if (typeof internDefaultDays === "number" && internDefaultDays >= 0) data.internDefaultDays = internDefaultDays;
  if (typeof paidDays === "number" && paidDays >= 0) data.paidDays = paidDays;
  if (typeof carryOver === "boolean") data.carryOver = carryOver;
  if (typeof maxCarryOver === "number" && maxCarryOver >= 0) data.maxCarryOver = maxCarryOver;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.leaveType.update({ where: { id }, data });

  // Immediately propagate entitlement changes to all active employees' current-year balances
  if (typeof defaultDays === "number" || typeof internDefaultDays === "number") {
    const currentYear = new Date().getFullYear();
    const staffDays = updated.defaultDays;
    const internDays = updated.internDefaultDays > 0 ? updated.internDefaultDays : updated.defaultDays;

    // Update all active non-intern staff
    await prisma.leaveBalance.updateMany({
      where: {
        leaveTypeId: id,
        year: currentYear,
        employee: {
          status: "ACTIVE",
          employmentType: { not: "INTERN" },
        },
      },
      data: { entitlement: staffDays },
    });

    // Update interns
    await prisma.leaveBalance.updateMany({
      where: {
        leaveTypeId: id,
        year: currentYear,
        employee: {
          status: "ACTIVE",
          employmentType: "INTERN",
        },
      },
      data: { entitlement: internDays },
    });
  }

  return NextResponse.json(updated);
}
