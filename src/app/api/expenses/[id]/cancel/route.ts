import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const expense = await prisma.expenseClaim.findUnique({ where: { id } });
    if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    if (expense.status !== "PENDING") return NextResponse.json({ error: "Only pending expense claims can be cancelled" }, { status: 400 });
    if (expense.employeeId !== session.user.employeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.expenseClaim.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling expense:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
