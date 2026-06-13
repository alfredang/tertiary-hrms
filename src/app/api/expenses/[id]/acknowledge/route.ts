import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim)
    return NextResponse.json({ error: "Expense claim not found" }, { status: 404 });

  if (claim.employeeId !== session.user.employeeId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (claim.status !== "APPROVED")
    return NextResponse.json({ error: "Only approved claims can be acknowledged" }, { status: 400 });

  await prisma.expenseClaim.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
