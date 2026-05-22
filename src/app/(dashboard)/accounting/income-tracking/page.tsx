import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { TransactionsTable } from "@/components/accounting/transactions-table";
import { AccountingClient } from "@/components/accounting/accounting-client";
import {
  ExpenseFilters,
  INCOME_PAYMENT_TYPE_OPTIONS,
} from "@/components/accounting/expense-filters";
import { Pagination } from "@/components/accounting/pagination";

const PAGE_SIZE = 200;

export const dynamic = "force-dynamic";

const TC_RE = /TC[A-Z]?\d{2}[-\s]?[\w]{4}[-\s]?[\w]{2,6}/i;

function extractTcFromTitle(title: string): string | null {
  const m = title?.match(TC_RE);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "-").toUpperCase();
  s = s.replace(/^TC([A-Z])(\d{2}-)/, "TC$2");
  if (!s.includes("-")) s = s.replace(/^TC(\d{2})(\w{4})(\w+)/, "TC$1-$2-$3");
  return s;
}

export default async function IncomeTrackingPage({
  searchParams,
}: {
  searchParams?: { status?: string; category?: string; from?: string; to?: string; page?: string };
}) {
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

  if (!(hasAdminAccess(role) || roles.includes("ACCOUNTANT"))) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Income Tracking</h1>
        <p className="text-sm text-gray-400">You do not have access to this section.</p>
      </div>
    );
  }

  // Defaults: status=Pending, category=All, no date range.
  const statusFilter = searchParams?.status ?? "Pending";
  const categoryFilter = searchParams?.category ?? "All";
  const fromFilter = searchParams?.from ?? "";
  const toFilter = searchParams?.to ?? "";

  const where: any = { direction: "CREDIT" };
  if (statusFilter !== "All") where.status = statusFilter;
  if (categoryFilter !== "All") where.paymentType = categoryFilter;
  if (fromFilter || toFilter) {
    where.paymentDate = {};
    if (fromFilter) where.paymentDate.gte = new Date(fromFilter);
    if (toFilter) {
      const end = new Date(toFilter);
      end.setHours(23, 59, 59, 999);
      where.paymentDate.lte = end;
    }
  }

  const total = await prisma.bankTransaction.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rawPage = parseInt(searchParams?.page ?? "1", 10);
  const page = isNaN(rawPage) ? 1 : Math.min(Math.max(1, rawPage), totalPages);

  const transactions = await prisma.bankTransaction.findMany({
    where,
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Auto-backfill invoiceNo from title for rows that have a TC number but no invoiceNo saved
  const backfillMap = new Map<string, string>();
  for (const t of transactions) {
    if (!t.invoiceNo) {
      const tc = extractTcFromTitle(t.title);
      if (tc) backfillMap.set(t.id, tc);
    }
  }
  if (backfillMap.size > 0) {
    await Promise.all(
      Array.from(backfillMap.entries()).map(([id, invoiceNo]) =>
        prisma.bankTransaction.update({ where: { id }, data: { invoiceNo } }),
      ),
    );
  }

  const rows = transactions.map((t) => ({
    id: t.id,
    paymentDate: t.paymentDate.toISOString().slice(0, 10),
    title: t.title,
    amount: Number(t.amount),
    type: t.type,
    paymentType: t.paymentType,
    paymentRef: t.paymentRef ?? "",
    invoiceNo: backfillMap.get(t.id) ?? t.invoiceNo ?? "",
    receiptNo: t.receiptNo ?? "",
    qbExpenseNo: t.qbExpenseNo ?? "",
    status: t.status,
    gstIncluded: t.gstIncluded,
    remarks: t.remarks ?? "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Income Tracking</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Credit transactions imported from bank statements.
        </p>
      </div>
      <AccountingClient />
      <ExpenseFilters
        status={statusFilter}
        category={categoryFilter}
        from={fromFilter}
        to={toFilter}
        categoryOptions={INCOME_PAYMENT_TYPE_OPTIONS}
        categoryLabel="Payment Type"
      />
      <TransactionsTable
        rows={rows}
        titleLabel="Customer Name"
        showGst={false}
        showReceiptNo
        showReceivePayment
        direction="CREDIT"
        emptyText="No income matches the current filters."
      />
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
