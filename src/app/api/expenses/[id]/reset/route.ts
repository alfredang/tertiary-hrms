import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

const resetSchema = z.object({
  reason: z.string().optional(),
});

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

    const body = await req.json().catch(() => ({}));
    const validation = resetSchema.safeParse(body);
    const reason = validation.success ? validation.data.reason : undefined;

    const expense = await prisma.expenseClaim.findUnique({
      where: { id },
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    if (expense.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cancelled expense claims cannot be reset" },
        { status: 400 }
      );
    }

    if (expense.status === "PENDING") {
      return NextResponse.json(
        { error: "Expense claim is already pending" },
        { status: 400 }
      );
    }

    const oldStatus = expense.status;

    await prisma.$transaction([
      prisma.expenseClaim.update({
        where: { id },
        data: {
          status: "PENDING",
          approverId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          paidAt: null,
          paymentReference: null,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "RESET_TO_PENDING",
          entity: "ExpenseClaim",
          entityId: id,
          oldValue: { status: oldStatus },
          newValue: { status: "PENDING", ...(reason ? { reason } : {}) },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resetting expense claim:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
