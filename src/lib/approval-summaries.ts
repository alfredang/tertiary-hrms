// Staff summaries shown on the approval result page after an admin clicks Approve / Decline in
// an approval email: leave taken + balances, expense claims, intern time-off hours.
// Builders are pure (unit tested); the load* functions fetch and never throw (a summary must
// never break the decision page).
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { getLeaveProfile, getNplStatus, type LeaveProfile } from "@/lib/leave-allowance";
import { isMedicalLeaveCode, NPL_CODE, type NplStatus } from "@/lib/leave-policy";
import { leaveBalanceAvailable, type BalanceRowInput } from "@/lib/leave-balance";
import { timeOffReasonLabel, isOffDay } from "@/lib/time-off";
import type { ResultSummary } from "@/lib/approval-result";
import { leaveBalancePeriodWhere } from "@/lib/annual-leave-policy";

const r2 = (x: number) => Math.round(x * 100) / 100;
const days = (x: number) => `${r2(x)} ${r2(x) === 1 ? "day" : "days"}`;
const hours = (x: number) => `${r2(x)} h`;

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

// ─── Leave ──────────────────────────────────────────────────────────────────

export type LeaveBalanceRow = BalanceRowInput & {
  leaveType: { code: string; name: string; paid: boolean; defaultDays: number };
};

function leaveOrder(code: string): number {
  if (code === "AL") return 0;
  if (code === "AL_OT") return 1;
  if (isMedicalLeaveCode(code)) return 2;
  if (code === NPL_CODE) return 9;
  return 5;
}

export function buildLeaveSummary(args: {
  employeeName: string;
  year: number;
  balances: LeaveBalanceRow[];
  profile: LeaveProfile | null;
  npl: NplStatus | null;
  asOf?: Date;
}): ResultSummary {
  const { balances, profile, npl, year } = args;
  let paidTaken = 0;
  let alBalance: number | null = null;
  let mcTaken = 0;
  const rows: { order: number; cells: string[] }[] = [];
  let sawNpl = false;

  for (const b of balances) {
    const code = b.leaveType.code;
    const used = Number(b.used ?? 0);
    const pending = Number(b.pending ?? 0);
    const { available } = leaveBalanceAvailable(b, profile, npl, args.asOf);

    if (code === NPL_CODE) {
      sawNpl = true;
      const taken = npl ? npl.used : used;
      const pend = npl ? npl.pending : pending;
      rows.push({ order: 9, cells: [b.leaveType.name, days(taken), days(pend), npl ? days(npl.remaining) : "-"] });
      continue;
    }
    if (b.leaveType.paid) paidTaken += used;
    if (code === "AL") alBalance = available;
    if (isMedicalLeaveCode(code)) mcTaken += used;

    const core = code === "AL" || isMedicalLeaveCode(code);
    const hasActivity = used > 0 || pending > 0 || (code === "AL_OT" && Number(b.earned ?? 0) > 0);
    if (!core && !hasActivity) continue;
    rows.push({ order: leaveOrder(code), cells: [b.leaveType.name, days(used), days(pending), days(available)] });
  }

  if (!sawNpl && npl && (npl.used > 0 || npl.pending > 0)) {
    rows.push({ order: 9, cells: ["No Pay Leave", days(npl.used), days(npl.pending), days(npl.remaining)] });
  }
  rows.sort((a, b) => a.order - b.order || a.cells[0].localeCompare(b.cells[0]));

  const nplTaken = npl?.used ?? 0;
  return {
    heading: `${args.employeeName}: leave summary ${year}`,
    stats: [
      { label: "Paid leave taken", value: days(paidTaken) },
      { label: "Annual leave balance", value: alBalance == null ? "-" : days(alBalance) },
      { label: "MC taken", value: days(mcTaken) },
      {
        label: "No-pay leave taken",
        value: days(nplTaken),
        hint: npl ? `${r2(npl.remaining)} of ${r2(npl.cap)} left` : undefined,
      },
    ],
    table: { columns: ["Leave type", "Taken", "Pending", "Balance"], rows: rows.map((r) => r.cells) },
    note: "Paid leave taken includes MC. Taken includes this decision. Balance = prorated entitlement + carried over − taken − pending.",
  };
}

export async function loadLeaveSummary(employeeId: string, year: number): Promise<ResultSummary | null> {
  try {
    const [employee, profile, balances] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }),
      getLeaveProfile(employeeId),
      // Current year: the rows the apps show (calendar-year rows + any contract-period
      // AL pool covering today, e.g. internships); past years: that year's rows.
      prisma.leaveBalance.findMany({
        where: { employeeId, ...(year === new Date().getFullYear() ? leaveBalancePeriodWhere() : { year }) },
        include: { leaveType: true },
      }),
    ]);
    const npl = await getNplStatus(employeeId, profile).catch(() => null);
    return buildLeaveSummary({ employeeName: employee?.name ?? "Staff", year, balances, profile, npl });
  } catch (err) {
    console.error(`leave summary failed for ${employeeId}:`, err);
    return null;
  }
}

// ─── Expense claims ─────────────────────────────────────────────────────────

export interface ExpenseRow {
  amount: { toString(): string } | number;
  status: string;
  category: { name: string };
}

export function buildExpenseSummary(employeeName: string, year: number, claims: ExpenseRow[]): ResultSummary {
  const zero = () => new Decimal(0);
  let approved = zero();
  let approvedCount = 0;
  let pending = zero();
  let pendingCount = 0;
  let paid = zero();
  const byCat = new Map<string, { approved: Decimal; pending: Decimal }>();
  for (const c of claims) {
    const amt = new Decimal(c.amount.toString());
    const cat = byCat.get(c.category.name) ?? { approved: zero(), pending: zero() };
    if (c.status === "APPROVED" || c.status === "PAID") {
      approved = approved.plus(amt);
      approvedCount++;
      cat.approved = cat.approved.plus(amt);
      if (c.status === "PAID") paid = paid.plus(amt);
    } else if (c.status === "PENDING") {
      pending = pending.plus(amt);
      pendingCount++;
      cat.pending = cat.pending.plus(amt);
    } else continue;
    byCat.set(c.category.name, cat);
  }
  const money = (d: Decimal) => formatCurrency(d.toNumber());
  return {
    heading: `${employeeName} — expense claims in ${year}`,
    stats: [
      { label: "Approved", value: money(approved), hint: `${approvedCount} claim${approvedCount === 1 ? "" : "s"}` },
      { label: "Paid out", value: money(paid) },
      { label: "Pending", value: money(pending), hint: `${pendingCount} claim${pendingCount === 1 ? "" : "s"}` },
    ],
    table: {
      columns: ["Category", "Approved", "Pending"],
      rows: Array.from(byCat.entries())
        .sort((a, b) => b[1].approved.comparedTo(a[1].approved))
        .map(([name, v]) => [name, money(v.approved), money(v.pending)]),
    },
    note: "Approved includes paid claims and this decision.",
  };
}

export async function loadExpenseSummary(employeeId: string, year: number): Promise<ResultSummary | null> {
  try {
    const [employee, claims] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }),
      prisma.expenseClaim.findMany({
        where: { employeeId, expenseDate: yearRange(year) },
        select: { amount: true, status: true, category: { select: { name: true } } },
      }),
    ]);
    return buildExpenseSummary(employee?.name ?? "Staff", year, claims);
  } catch (err) {
    console.error(`expense summary failed for ${employeeId}:`, err);
    return null;
  }
}

// ─── Intern time-off ────────────────────────────────────────────────────────

export interface TimeOffRow {
  date: Date;
  hours: { toString(): string } | number;
  status: string;
  reason: Parameters<typeof timeOffReasonLabel>[0];
}

export function buildTimeOffSummary(employeeName: string, year: number, month: number, rows: TimeOffRow[]): ResultSummary {
  let yearHours = 0;
  let monthHours = 0;
  let pendingHours = 0;
  let offDaysYear = 0;
  let offDaysPending = 0;
  const byReason = new Map<string, number>();
  for (const r of rows) {
    // Off Days are whole days (0 hours): counted as days, never in the hour totals.
    if (isOffDay(r.reason)) {
      if (r.status === "APPROVED") offDaysYear++;
      else if (r.status === "PENDING") offDaysPending++;
      continue;
    }
    const h = Number(r.hours.toString());
    if (r.status === "APPROVED") {
      yearHours += h;
      if (r.date.getUTCMonth() + 1 === month) monthHours += h;
      const label = timeOffReasonLabel(r.reason);
      byReason.set(label, (byReason.get(label) ?? 0) + h);
    } else if (r.status === "PENDING") {
      pendingHours += h;
    }
  }
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return {
    heading: `${employeeName} — time off in ${year}`,
    stats: [
      { label: `Taken in ${monthName}`, value: hours(monthHours) },
      { label: `Taken in ${year}`, value: hours(yearHours) },
      { label: "Pending", value: hours(pendingHours) },
      ...(offDaysYear || offDaysPending
        ? [{ label: `Off Days in ${year}`, value: `${offDaysYear}${offDaysPending ? ` (+${offDaysPending} pending)` : ""}` }]
        : []),
    ],
    table: {
      columns: ["Reason", "Hours taken"],
      rows: Array.from(byReason.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, hours(v)]),
    },
    note: "Taken includes this decision.",
  };
}

export async function loadTimeOffSummary(employeeId: string, date: Date): Promise<ResultSummary | null> {
  const year = date.getUTCFullYear();
  try {
    const [employee, rows] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }),
      prisma.timeOffRequest.findMany({
        where: { employeeId, date: yearRange(year) },
        select: { date: true, hours: true, status: true, reason: true },
      }),
    ]);
    return buildTimeOffSummary(employee?.name ?? "Intern", year, date.getUTCMonth() + 1, rows);
  } catch (err) {
    console.error(`time-off summary failed for ${employeeId}:`, err);
    return null;
  }
}
