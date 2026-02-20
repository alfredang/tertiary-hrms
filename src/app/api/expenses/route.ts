import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

const expenseSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Expense date is required"),
  receiptUrl: z.string().optional(),
  receiptFileName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    let employeeId: string | undefined;

    if (process.env.SKIP_AUTH !== "true") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      employeeId = session.user.employeeId;
    } else {
      const adminUser = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        include: { employee: true },
      });
      employeeId = adminUser?.employee?.id;
    }

    if (!employeeId) {
      return NextResponse.json(
        { error: "No employee record found for this user" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validation = expenseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { categoryId, description, amount, expenseDate, receiptUrl, receiptFileName } =
      validation.data;

    const expenseClaim = await prisma.expenseClaim.create({
      data: {
        id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        employeeId,
        categoryId,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        receiptUrl: receiptUrl || null,
        receiptFileName: receiptFileName || null,
        status: "PENDING",
      },
      include: {
        category: true,
        employee: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(expenseClaim, { status: 201 });
  } catch (error) {
    console.error("Error creating expense claim:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
