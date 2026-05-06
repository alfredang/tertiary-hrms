import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const employeeIdParam = searchParams.get("employeeId");
  const isAdmin = hasAdminAccess(session.user.role);

  // Staff/Intern can only view own records; admins can view any
  const employeeId = isAdmin && employeeIdParam ? employeeIdParam : session.user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee record" }, { status: 400 });

  const records = await prisma.attendance.findMany({
    where: isAdmin && !employeeIdParam ? {} : { employeeId },
    include: {
      employee: { select: { name: true, employeeId: true } },
      otEntry: { select: { id: true, earnedDays: true, status: true } },
    },
    orderBy: { date: "desc" },
    take: 60,
  });

  return NextResponse.json(records);
}
