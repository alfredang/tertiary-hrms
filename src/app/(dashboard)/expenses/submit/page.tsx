import { prisma } from "@/lib/prisma";
import { ExpenseSubmitForm } from "@/components/expenses/expense-submit-form";

export const dynamic = "force-dynamic";

async function getCategories() {
  return prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
}

export default async function ExpenseSubmitPage() {
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Submit Expense</h1>
        <p className="text-gray-400 mt-1">Submit a new expense claim</p>
      </div>

      <ExpenseSubmitForm categories={categories} />
    </div>
  );
}
