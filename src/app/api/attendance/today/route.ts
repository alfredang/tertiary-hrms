import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toLocalDateString } from "@/lib/utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeId = session.user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee record" }, { status: 400 });

  const today = toLocalDateString(new Date());
  const record = await prisma.attendance.findFirst({
    where: {
      employeeId,
      date: { gte: new Date(today), lt: new Date(today + "T23:59:59") },
    },
    include: { otEntry: { select: { earnedDays: true, status: true } } },
  });

  return NextResponse.json({ record });
}
