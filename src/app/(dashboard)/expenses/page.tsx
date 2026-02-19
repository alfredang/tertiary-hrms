import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExpenseList } from "@/components/expenses/expense-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const dynamic = 'force-dynamic';

async function getExpenseStats(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const totalExpenses = await prisma.expenseClaim.aggregate({
    where,
    _sum: { amount: true },
  });

  const claimsCount = await prisma.expenseClaim.count({ where });

  return {
    totalExpenses: Number(totalExpenses._sum.amount || 0),
    claimsCount,
  };
}

async function getExpenseClaims(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const claims = await prisma.expenseClaim.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      category: { select: { name: true, code: true } },
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return claims;
}

async function getCategories() {
  return prisma.expenseCategory.findMany({
    orderBy: { name: "asc" },
  });
}

export default async function ExpensesPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role = "STAFF";
  let currentEmployeeId: string | undefined;

  if (process.env.SKIP_AUTH === "true") {
    role = "ADMIN";
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      include: { employee: { select: { id: true } } },
    });
    currentEmployeeId = adminUser?.employee?.id;
  } else {
    if (!session?.user) {
      return null;
    }
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
  }

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewAs = isAdmin ? viewMode : "staff";

  // Admin view: show all expenses; Staff view: show only own
  const filterByEmployeeId = viewAs === "staff" ? currentEmployeeId : undefined;

  // Safety: prevent data leak if staff view but no employeeId
  if (viewAs === "staff" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-white">Expense Claims</h1>
        <p className="text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const [stats, claims, categories] = await Promise.all([
    getExpenseStats(filterByEmployeeId),
    getExpenseClaims(filterByEmployeeId),
    getCategories(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Expense Claims</h1>
          <p className="text-gray-400 mt-1">
            {viewAs === "admin" ? "Manage all employee expenses" : "Submit and manage expenses"}
          </p>
        </div>
        {viewAs === "staff" && (
          <Link href="/expenses/submit">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Expense
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Header - only for staff view */}
      {viewAs === "staff" && (
        <div className="bg-gray-950 border border-gray-800 text-white rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Expenses</p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(stats.totalExpenses)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {stats.claimsCount} claims
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-800">
              <DollarSign className="h-8 w-8 text-gray-400" />
            </div>
          </div>
        </div>
      )}

      <ExpenseList claims={claims} categories={categories} isManager={viewAs === "admin"} />
    </div>
  );
}
