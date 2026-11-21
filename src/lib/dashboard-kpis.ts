import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { isApplicant } from "@/lib/trainers";

/**
 * KPI numbers for the role-specific rows on /dashboard (Alfred, 20 Nov 2026):
 * accountant view = finance, Trainer Admins = trainer counts. The admin row is in
 * `getAdminDashboard()` and the staff / intern row in `getStaffStats()` (dashboard page).
 */

export interface FinanceKpis {
  pendingClaims: number;
  pendingClaimsAmount: number;
  incomeMonth: number;
  incomeYtd: number;
  expensesMonth: number;
  expensesYtd: number;
  monthLabel: string;
  year: number;
  /** Bank credits / debits this month (counts); the mobile accountant Home (22 Nov 2026). */
  incomeCountMonth?: number;
  expenseCountMonth?: number;
  /** Bank statement imports: how many, the last bank date they cover (yyyy-mm-dd) and when the last one was imported. */
  statementImports?: number;
  statementLatestDate?: string | null;
  statementLastImportedAt?: string | null;
  /** Latest bank reconciliation run; `toReview` = its unreviewed lines that are not a match. */
  reconciliation?: {
    status: string;
    periodStart: string;
    periodEnd: string;
    matched: number;
    toReview: number;
    createdAt: string;
  } | null;
}

/** First day of the current month and year in Singapore, as the UTC dates a `@db.Date` column holds. */
export function singaporePeriod(now: Date): { year: number; monthStart: Date; nextMonthStart: Date; yearStart: Date } {
  const sg = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = sg.getUTCFullYear();
  const month = sg.getUTCMonth();
  return {
    year,
    monthStart: new Date(Date.UTC(year, month, 1)),
    nextMonthStart: new Date(Date.UTC(year, month + 1, 1)),
    yearStart: new Date(Date.UTC(year, 0, 1)),
  };
}

type DirectionSum = { direction: string; _sum: { amount: Decimal.Value | null } };

/** Bank credits are income and debits are expenses, as on Income Tracking and Expense Tracking. */
export function splitByDirection(rows: DirectionSum[]): { income: number; expenses: number } {
  let income = new Decimal(0);
  let expenses = new Decimal(0);
  for (const r of rows) {
    const amount = new Decimal(r._sum.amount?.toString() ?? 0);
    if (r.direction === "CREDIT") income = income.plus(amount);
    else expenses = expenses.plus(amount);
  }
  return { income: income.toDecimalPlaces(2).toNumber(), expenses: expenses.toDecimalPlaces(2).toNumber() };
}

export async function getFinanceKpis(now: Date = new Date()): Promise<FinanceKpis> {
  const { year, monthStart, nextMonthStart, yearStart } = singaporePeriod(now);
  const [claims, month, ytd, monthCounts, imports, latestTxn, lastRun] = await Promise.all([
    prisma.expenseClaim.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amount: true } }),
    prisma.bankTransaction.groupBy({
      by: ["direction"], where: { paymentDate: { gte: monthStart, lt: nextMonthStart } }, _sum: { amount: true },
    }),
    prisma.bankTransaction.groupBy({
      by: ["direction"], where: { paymentDate: { gte: yearStart, lt: nextMonthStart } }, _sum: { amount: true },
    }),
    prisma.bankTransaction.groupBy({
      by: ["direction"], where: { paymentDate: { gte: monthStart, lt: nextMonthStart } }, _count: { _all: true },
    }),
    prisma.bankTransaction.groupBy({ by: ["importBatchId"], _max: { createdAt: true } }),
    prisma.bankTransaction.aggregate({ _max: { paymentDate: true } }),
    prisma.bankReconciliation.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, periodStart: true, periodEnd: true, matchedCount: true, createdAt: true },
    }),
  ]);
  const toReview = lastRun
    ? await prisma.bankReconciliationItem.count({
        where: { reconciliationId: lastRun.id, status: { not: "MATCHED" }, reviewed: false },
      })
    : 0;
  const counted = (dir: string) =>
    (monthCounts as { direction: string; _count: { _all: number } }[]).find((r) => r.direction === dir)?._count._all ?? 0;
  const lastImport = imports.reduce<Date | null>((latest, b) => {
    const at = b._max.createdAt;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  const m = splitByDirection(month as DirectionSum[]);
  const y = splitByDirection(ytd as DirectionSum[]);
  return {
    pendingClaims: claims._count,
    pendingClaimsAmount: new Decimal(claims._sum.amount?.toString() ?? 0).toDecimalPlaces(2).toNumber(),
    incomeMonth: m.income, incomeYtd: y.income,
    expensesMonth: m.expenses, expensesYtd: y.expenses,
    monthLabel: now.toLocaleDateString("en-SG", { month: "short", timeZone: "Asia/Singapore" }),
    year,
    incomeCountMonth: counted("CREDIT"),
    expenseCountMonth: (monthCounts as { direction: string; _count: { _all: number } }[])
      .filter((r) => r.direction !== "CREDIT").reduce((t, r) => t + r._count._all, 0),
    statementImports: imports.length,
    statementLatestDate: ymd(latestTxn._max.paymentDate),
    statementLastImportedAt: lastImport ? lastImport.toISOString() : null,
    reconciliation: lastRun
      ? {
          status: lastRun.status,
          periodStart: ymd(lastRun.periodStart)!,
          periodEnd: ymd(lastRun.periodEnd)!,
          matched: lastRun.matchedCount,
          toReview,
          createdAt: lastRun.createdAt.toISOString(),
        }
      : null,
  };
}

export interface TrainerKpis {
  total: number;
  aclp: number;
  nonAclp: number;
}

/** Same counting as the KPI tiles on /trainers: applicants are not trainers yet. */
export function countTrainers(rows: { status: string; trainingCerts: string[] }[]): TrainerKpis {
  const pool = rows.filter((t) => !isApplicant(t));
  const aclp = pool.filter((t) => t.trainingCerts.includes("ACLP")).length;
  return { total: pool.length, aclp, nonAclp: pool.length - aclp };
}

export async function getTrainerKpis(): Promise<TrainerKpis> {
  return countTrainers(await prisma.trainer.findMany({ select: { status: true, trainingCerts: true } }));
}
