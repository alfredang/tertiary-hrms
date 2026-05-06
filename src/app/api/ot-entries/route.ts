import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status"); // PENDING_APPROVAL | APPROVED | REJECTED | all
  const isAdmin = hasAdminAccess(session.user.role);

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.employeeId = session.user.employeeId;
  }
  if (statusFilter && statusFilter !== "all") {
    where.status = statusFilter;
  }

  const entries = await prisma.otEntry.findMany({
    where,
    include: {
      employee: { select: { name: true, employeeId: true, department: { select: { name: true } } } },
      approver: { select: { name: true } },
      attendance: { select: { clockIn: true, clockOut: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries);
}
