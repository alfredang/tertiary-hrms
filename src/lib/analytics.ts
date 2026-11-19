import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { isInternRoles } from "@/lib/leave-policy";
import { leaveCategory, type LeaveCategory } from "@/lib/hr-insights";

/**
 * Data for /dashboard/analytics: the last 12 calendar months of bank revenue and expenses,
 * approved leave per person, and headcount. The page filters and slices it in the browser,
 * so the rows stay small: one per (month, category) or (month, person, leave category).
 */

export interface AnalyticsMonth {
  key: string; // "2026-11"
  label: string; // "Nov"
  year: number;
}
export interface FinanceRow {
  month: string;
  type: string;
  revenue: number;
  expenses: number;
}
export interface LeaveRow {
  month: string;
  personId: string;
  category: LeaveCategory;
  days: number;
}
export interface AnalyticsPerson {
  id: string;
  name: string;
  code: string;
  intern: boolean;
  active: boolean;
}
export interface HeadcountRow {
  month: string;
  staff: number;
  interns: number;
}
export interface AnalyticsData {
  months: AnalyticsMonth[];
  /** null when the viewer may not see accounting data. */
  finance: FinanceRow[] | null;
  /** First and last bank transaction date in the window ("2026-04-30"), for the "data from" note. */
  financeRange: { from: string; to: string } | null;
  leave: LeaveRow[];
  people: AnalyticsPerson[];
  headcount: HeadcountRow[];
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** The last `count` calendar months ending with the month of `now` (Singapore time), oldest first. */
export function lastMonths(now: Date, count = 12): AnalyticsMonth[] {
  const sgt = new Date(now.getTime() + 8 * 3600_000);
  const y = sgt.getUTCFullYear();
  const m = sgt.getUTCMonth();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (count - 1 - i), 1));
    return { key: monthKey(d), label: d.toLocaleDateString("en-SG", { month: "short", timeZone: "UTC" }), year: d.getUTCFullYear() };
  });
}

export interface EmploymentSpan {
  startDate: Date | null;
  endDate: Date | null;
  intern: boolean;
}

/**
 * People employed on the last day of each month (today for the current month):
 * started on or before that day and not yet ended.
 */
export function headcountByMonth(months: AnalyticsMonth[], people: EmploymentSpan[], now: Date): HeadcountRow[] {
  return months.map((mo) => {
    const [y, m] = mo.key.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    const ref = monthEnd.getTime() > now.getTime() ? now : monthEnd;
    let staff = 0;
    let interns = 0;
    for (const p of people) {
      if (!p.startDate || p.startDate.getTime() > ref.getTime()) continue;
      if (p.endDate && p.endDate.getTime() < ref.getTime()) continue;
      if (p.intern) interns += 1;
      else staff += 1;
    }
    return { month: mo.key, staff, interns };
  });
}

export async function getAnalyticsData(now: Date = new Date(), opts: { finance: boolean } = { finance: true }): Promise<AnalyticsData> {
  const months = lastMonths(now, 12);
  const [fy, fm] = months[0].key.split("-").map(Number);
  const from = new Date(Date.UTC(fy, fm - 1, 1));
  const known = new Set(months.map((m) => m.key));

  const [bank, leaves, employees] = await Promise.all([
    opts.finance
      ? prisma.bankTransaction.findMany({
          where: { paymentDate: { gte: from } },
          select: { paymentDate: true, amount: true, direction: true, type: true },
        })
      : Promise.resolve(null),
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { gte: from } },
      select: { employeeId: true, startDate: true, days: true, leaveType: { select: { code: true } } },
    }),
    prisma.employee.findMany({
      select: { id: true, name: true, employeeId: true, status: true, startDate: true, endDate: true, user: { select: { roles: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  let finance: FinanceRow[] | null = null;
  let financeRange: AnalyticsData["financeRange"] = null;
  if (bank) {
    const sums = new Map<string, { revenue: Decimal; expenses: Decimal }>();
    let min = "";
    let max = "";
    for (const t of bank) {
      const mk = monthKey(t.paymentDate);
      if (!known.has(mk)) continue;
      const day = t.paymentDate.toISOString().slice(0, 10);
      if (!min || day < min) min = day;
      if (!max || day > max) max = day;
      const k = `${mk}|${t.type || "Other"}`;
      const cell = sums.get(k) ?? { revenue: new Decimal(0), expenses: new Decimal(0) };
      if (t.direction === "CREDIT") cell.revenue = cell.revenue.plus(t.amount.toString());
      else cell.expenses = cell.expenses.plus(t.amount.toString());
      sums.set(k, cell);
    }
    finance = Array.from(sums.entries()).map(([k, v]) => {
      const [month, type] = k.split("|");
      return { month, type, revenue: v.revenue.toDecimalPlaces(2).toNumber(), expenses: v.expenses.toDecimalPlaces(2).toNumber() };
    });
    financeRange = min ? { from: min, to: max } : null;
  }

  const leaveSums = new Map<string, number>();
  for (const l of leaves) {
    const mk = monthKey(l.startDate);
    if (!known.has(mk)) continue;
    const k = `${mk}|${l.employeeId}|${leaveCategory(l.leaveType.code)}`;
    leaveSums.set(k, (leaveSums.get(k) ?? 0) + Number(l.days));
  }
  const leave: LeaveRow[] = Array.from(leaveSums.entries()).map(([k, days]) => {
    const [month, personId, category] = k.split("|");
    return { month, personId, category: category as LeaveCategory, days };
  });

  const people: AnalyticsPerson[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.employeeId,
    intern: isInternRoles(e.user?.roles),
    active: e.status === "ACTIVE" || e.status === "ON_LEAVE",
  }));

  const headcount = headcountByMonth(
    months,
    employees.map((e) => ({ startDate: e.startDate, endDate: e.endDate, intern: isInternRoles(e.user?.roles) })),
    now,
  );

  return { months, finance, financeRange, leave, people, headcount };
}
