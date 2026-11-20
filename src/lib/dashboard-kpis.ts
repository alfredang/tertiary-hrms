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
  const [claims, month, ytd] = await Promise.all([
    prisma.expenseClaim.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amount: true } }),
    prisma.bankTransaction.groupBy({
      by: ["direction"], where: { paymentDate: { gte: monthStart, lt: nextMonthStart } }, _sum: { amount: true },
    }),
    prisma.bankTransaction.groupBy({
      by: ["direction"], where: { paymentDate: { gte: yearStart, lt: nextMonthStart } }, _sum: { amount: true },
    }),
  ]);
  const m = splitByDirection(month as DirectionSum[]);
  const y = splitByDirection(ytd as DirectionSum[]);
  return {
    pendingClaims: claims._count,
    pendingClaimsAmount: new Decimal(claims._sum.amount?.toString() ?? 0).toDecimalPlaces(2).toNumber(),
    incomeMonth: m.income, incomeYtd: y.income,
    expensesMonth: m.expenses, expensesYtd: y.expenses,
    monthLabel: now.toLocaleDateString("en-SG", { month: "short", timeZone: "Asia/Singapore" }),
    year,
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
