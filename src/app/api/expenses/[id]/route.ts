import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

const expenseEditSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Expense date is required"),
  receiptUrl: z.string().optional(),
  receiptFileName: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        { error: "Only pending expense claims can be edited" },
        { status: 400 }
      );
    }

    if (expense.employeeId !== session.user.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validation = expenseEditSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { categoryId, description, amount, expenseDate, receiptUrl, receiptFileName } =
      validation.data;

    // Reject future dates
    const expenseDateObj = new Date(expenseDate);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (expenseDateObj > todayEnd) {
      return NextResponse.json(
        { error: "Expense date cannot be in the future" },
        { status: 400 }
      );
    }

    // Check category maxAmount
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    });

    if (category?.maxAmount && amount > Number(category.maxAmount)) {
      return NextResponse.json(
        {
          error: `Amount exceeds category limit of $${Number(category.maxAmount).toFixed(2)}`,
          maxAmount: Number(category.maxAmount),
        },
        { status: 400 }
      );
    }

    const updated = await prisma.expenseClaim.update({
      where: { id },
      data: {
        categoryId,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        receiptUrl: receiptUrl !== undefined ? receiptUrl : expense.receiptUrl,
        receiptFileName:
          receiptFileName !== undefined ? receiptFileName : expense.receiptFileName,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error editing expense claim:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
