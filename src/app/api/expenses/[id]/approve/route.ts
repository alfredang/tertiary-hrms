import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendExpenseDecisionEmail } from "@/lib/decision-email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const expense = await prisma.expenseClaim.findUnique({
      where: { id },
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    if (expense.status !== "PENDING") {
      return NextResponse.json(
        { error: "Expense is not pending" },
        { status: 400 }
      );
    }

    const updated = await prisma.expenseClaim.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: session.user.employeeId,
        approvedAt: new Date(),
      },
    });

    await sendExpenseDecisionEmail(updated.id, "APPROVED", { approverName: session.user.name });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error approving expense:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
