import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";

// PATCH /api/employees/[id]/leave-balance
// Body: { leaveBalanceId: string; entitlement: number; carriedOver?: number }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["ADMIN", "HR", "MANAGER"].includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: employeeId } = await params;
  const body = await req.json();
  const { leaveBalanceId, entitlement, carriedOver, used } = body;

  if (!leaveBalanceId || entitlement === undefined)
    return NextResponse.json({ error: "leaveBalanceId and entitlement are required" }, { status: 400 });

  if (typeof entitlement !== "number" || entitlement < 0)
    return NextResponse.json({ error: "entitlement must be a non-negative number" }, { status: 400 });

  if (used !== undefined && (typeof used !== "number" || used < 0))
    return NextResponse.json({ error: "used must be a non-negative number" }, { status: 400 });

  const balance = await prisma.leaveBalance.findFirst({
    where: { id: leaveBalanceId, employeeId },
  });

  if (!balance)
    return NextResponse.json({ error: "Leave balance not found" }, { status: 404 });

  const updated = await prisma.leaveBalance.update({
    where: { id: leaveBalanceId },
    data: {
      entitlement,
      ...(carriedOver !== undefined && { carriedOver }),
      ...(used !== undefined && { used }),
      updatedAt: new Date(),
    },
    include: { leaveType: true },
  });

  return NextResponse.json(updated);
}
