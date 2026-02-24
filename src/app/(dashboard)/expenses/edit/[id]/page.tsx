import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ExpenseEditForm } from "@/components/expenses/expense-edit-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExpenseEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();

  if (process.env.SKIP_AUTH !== "true" && !session?.user) {
    redirect("/login");
  }

  const currentEmployeeId = session?.user?.employeeId ?? null;

  const [expense, categories] = await Promise.all([
    prisma.expenseClaim.findUnique({ where: { id } }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!expense) {
    return (
      <div className="space-y-6">
        <Link href="/expenses">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Expenses
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">Expense claim not found.</p>
        </div>
      </div>
    );
  }

  // Ownership check
  if (
    process.env.SKIP_AUTH !== "true" &&
    expense.employeeId !== currentEmployeeId
  ) {
    return (
      <div className="space-y-6">
        <Link href="/expenses">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Expenses
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">You do not have permission to edit this expense claim.</p>
        </div>
      </div>
    );
  }

  // Status check — only PENDING can be edited
  if (expense.status !== "PENDING") {
    return (
      <div className="space-y-6">
        <Link href="/expenses">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Expenses
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">
            This expense claim can no longer be edited (status: {expense.status}).
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Only pending expense claims can be edited. Please contact HR if you need changes.
          </p>
        </div>
      </div>
    );
  }

  const expenseDate = new Date(expense.expenseDate).toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Edit Expense Claim</h1>
        <p className="text-gray-400 mt-1">Update your pending expense claim</p>
      </div>
      <ExpenseEditForm
        expenseId={id}
        initialData={{
          categoryId: expense.categoryId,
          description: expense.description,
          amount: Number(expense.amount),
          expenseDate,
          receiptUrl: expense.receiptUrl,
          receiptFileName: expense.receiptFileName,
        }}
        categories={categories}
      />
    </div>
  );
}
