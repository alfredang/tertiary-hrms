// One person's month at a glance, for working out their pay (Alfred, 26 Nov 2026): the four figures
// that move a payout, for the month picked on the person page (web `/employees/[id]`, the apps' Team →
// person page). Time Off is not one of them.
//
//   Annual Leave  — approved AL days in the month (paid; shown so the month is complete).
//   No Pay Leave  — approved No Pay Leave days in the month, except intern sick leave.
//   MC            — interns: "No Pay MC" (an MC request, or the No Pay Leave the API files for an intern's
//                   MC, "Sick leave (MC) — …"); staff: "Paid MC" (their MC requests). `mcPaid` says which.
//   Payback       — approved paybacks: off days worked in the month (added back on the payslip).
//
// Interns: No Pay Leave + No Pay MC = the payslip's unpaid days; staff: No Pay Leave = the payslip's
// unpaid days (`loadUnpaidDays`). Payback = its
// `paybackDays`: days are split across months the same way (`nplDaysOfRequest`: Mon–Fri, public
// holidays excluded) and paybacks count on the day worked.

import { prisma } from "@/lib/prisma";
import { isInternEmployee } from "@/lib/leave-policy";
import { holidayKeys } from "@/lib/npl-payback-store";
import { loadPaybackDays } from "@/lib/payroll-month-end";

export { AL_CODE, INTERN_MC_REASON_PREFIX, monthKey, payMonthLeaveFigures } from "@/lib/leave-month-figures";
export type { PayMonthRequest } from "@/lib/leave-month-figures";
import { monthKey, payMonthLeaveFigures } from "@/lib/leave-month-figures";

export interface PayMonthSummary {
  /** "YYYY-MM" */
  month: string;
  intern: boolean;
  annualLeaveDays: number;
  noPayLeaveDays: number;
  /** MC days in the month: unpaid for interns ("No Pay MC"), paid for staff ("Paid MC"). */
  mcDays: number;
  /** False for interns (their MC is No Pay MC), true for staff (Paid MC). */
  mcPaid: boolean;
  /** Card label for `mcDays`: "No Pay MC" or "Paid MC". */
  mcLabel: string;
  paybackDays: number;
}

/** "2026-09" → { year: 2026, month: 9 }; null when not a valid month. */
export function parseMonth(value: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

/** The four figures for one person and month, from the database. Null when the person does not exist. */
export async function loadPayMonthSummary(employeeId: string, year: number, month: number): Promise<PayMonthSummary | null> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { employmentType: true, user: { select: { roles: true } } },
  });
  if (!employee) return null;
  const intern = isInternEmployee({ employmentType: employee.employmentType, roles: employee.user?.roles });
  // Leave dates are stored as UTC calendar dates.
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const [requests, holidays, paybackDays] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
      select: { startDate: true, endDate: true, days: true, reason: true, leaveType: { select: { code: true } } },
    }),
    holidayKeys([year - 1, year, year + 1]),
    loadPaybackDays(employeeId, month, year),
  ]);
  const figures = payMonthLeaveFigures(
    requests.map((r) => ({ code: r.leaveType.code, reason: r.reason, startDate: r.startDate, endDate: r.endDate, days: Number(r.days) })),
    intern,
    month,
    year,
    holidays,
  );
  return {
    month: monthKey(year, month), intern, ...figures,
    mcPaid: !intern, mcLabel: intern ? "No Pay MC" : "Paid MC",
    paybackDays,
  };
}
