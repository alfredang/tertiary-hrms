import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const updated = await prisma.expenseClaim.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: {
      status: "APPROVED",
      approverId: session.user.employeeId,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ approved: updated.count, requested: ids.length });
}
