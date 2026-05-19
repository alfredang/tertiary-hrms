import Link from "next/link";
import { TrendingDown, TrendingUp, ChevronRight, FolderOpen, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess, formatCurrency } from "@/lib/utils";
import { AccountingClient } from "@/components/accounting/accounting-client";

export const dynamic = "force-dynamic";

async function getDirectionStats(direction: "DEBIT" | "CREDIT") {
  const agg = await prisma.bankTransaction.aggregate({
    where: { direction },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return {
    total: Number(agg._sum.amount ?? 0),
    count: agg._count._all,
  };
}

export default async function AccountingPage() {
  const session = await auth();

  let role = "STAFF";
  let roles: string[] = [];
  if (isDevAuthSkipped()) {
    role = "ADMIN";
    roles = ["ADMIN"];
  } else {
    if (!session?.user) return null;
    role = (session.user as any).role ?? "STAFF";
    roles = (session.user as any).roles ?? [role];
  }

  const allowed = hasAdminAccess(role) || roles.includes("ACCOUNTANT");
  if (!allowed) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Accounting</h1>
        <p className="text-sm text-gray-400">You do not have access to this section.</p>
      </div>
    );
  }

  const [expense, income] = await Promise.all([
    getDirectionStats("DEBIT"),
    getDirectionStats("CREDIT"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Accounting</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Upload bank statements. Debit rows feed Expense Tracking, credit rows feed Income Tracking.
          Duplicate transactions are detected automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/accounting/expense-tracking"
          className="group bg-gray-950 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-900/30">
                <TrendingDown className="h-6 w-6 text-red-300" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Expense Tracking</p>
                <p className="text-2xl font-bold text-white mt-0.5">
                  {formatCurrency(expense.total)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {expense.count} debit{expense.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-500 group-hover:text-gray-300" />
          </div>
        </Link>

        <Link
          href="/accounting/income-tracking"
          className="group bg-gray-950 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-900/30">
                <TrendingUp className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Income Tracking</p>
                <p className="text-2xl font-bold text-white mt-0.5">
                  {formatCurrency(income.total)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {income.count} credit{income.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-500 group-hover:text-gray-300" />
          </div>
        </Link>
      </div>

      <a
        href="https://drive.google.com/drive/u/1/folders/1U6MCWuKZQ4wWZqn36AVHUeOD7a-URAaY"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between bg-gray-950 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-900/30">
            <FolderOpen className="h-6 w-6 text-blue-300" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Bank Statements</p>
            <p className="text-base font-semibold text-white mt-0.5">
              Open Google Drive folder
            </p>
            <p className="text-xs text-gray-500 mt-1">Shared archive of uploaded statements</p>
          </div>
        </div>
        <ExternalLink className="h-5 w-5 text-gray-500 group-hover:text-gray-300" />
      </a>

      <AccountingClient />
    </div>
  );
}
