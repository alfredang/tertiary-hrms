import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { calculatePayroll, countWorkingDays, prorateMonthlySalary } from "@/lib/cpf-calculator";
import { isInternEmployee, MEDICAL_LEAVE_CODES, NPL_CODE } from "@/lib/leave-policy";
import { nplDaysOfRequest, ymd } from "@/lib/npl-payback";
import { holidayKeys } from "@/lib/npl-payback-store";
import { escapeHtml, notifyAdmins } from "@/lib/admin-alerts";
import { listCpfSubmissionFiles } from "@/lib/cpf-submission-files";
import { internPayslipFigures } from "@/lib/intern-pay";
import { payMonthLeaveFigures } from "@/lib/leave-month-figures";

/**
 * Payslip source rule (Alfred, 26 Nov 2026):
 *  - A month whose CPF EZPay statement was uploaded: staff payslips come from the
 *    statement only (/api/payroll/cpf-submission/*). Staff missing from it are
 *    reported to the admins, never computed.
 *  - No statement by the end of the month: everyone without a payslip gets one from
 *    their base salary (SalaryInfo basic + allowances, prorated for a part month).
 *  - Interns have no CPF, so they are never on the statement: they always get a
 *    base-salary payslip with CPF 0.
 * Runs on the 1st–3rd (SGT) for the month just ended, from the 08:30 SGT roll-up
 * (`monthEndPayroll`), and from the "Auto-Generate" button. It never overwrites a
 * payslip; a CPF upload afterwards replaces the base-salary ones (apply route,
 * overwrite: true). Income tax is 0 on every path, as on the CPF path.
 */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export { isInternEmployee };

export function payPeriod(month: number, year: number) {
  return {
    payPeriodStart: new Date(year, month - 1, 1),
    payPeriodEnd: new Date(year, month, 0),
    paymentDate: new Date(year, month - 1, 28),
  };
}

type SalaryInput = {
  basicSalary: unknown;
  allowances: unknown;
  cpfApplicable?: boolean | null;
};

export interface BaseSalaryFigures {
  basicSalary: number;
  allowances: number;
  overtime: number;
  bonus: number;
  grossSalary: number;
  /** No Pay Leave + MC (interns): the total unpaid days and amount. */
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  /** The two unpaid lines on their own: No Pay Leave, and MC (interns only; staff MC is paid). */
  nplDays: number;
  nplDeduction: number;
  mcDays: number;
  mcDeduction: number;
  paybackDays: number;
  paybackAmount: number;
  cpfEmployee: number;
  cpfEmployer: number;
  incomeTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
}

export type BaseSalaryResult = { ok: true; payroll: BaseSalaryFigures } | { ok: false; reason: string };

const money = (d: Decimal.Value) => new Decimal(d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/**
 * Base-salary payslip figures for one person and month (pure). Shown line by line on the payslip:
 *  - Interns: the HARD-CODED formula in src/lib/intern-pay.ts (`internPayslipFigures`):
 *    take-home = (working days − No Pay Leave − MC + payback) × gross ÷ working days, rounded down
 *    to a whole dollar; gross = the flat monthly amount, no proration, no CPF (employee or employer).
 *  - Staff: prorated for a part month (MOM working-day standard), CPF by age band.
 *  - Unpaid days taken in the month (No Pay Leave; MC too for interns) are a deduction line at
 *    the day rate = monthly rate / Mon–Fri working days in the month, at most the month's pay.
 *  - Paybacks (approved off days worked in the month) are an add-back line at the same day rate,
 *    so they give back what the leave took. Gross is the base pay ONLY (an intern's flat $600 /
 *    $1,000, never more; Alfred, 26 Nov 2026): the payback goes into take-home, not gross.
 *    Take-home = gross − unpaid leave − CPF + payback.
 *  - Staff CPF is on the pay actually earned (gross − unpaid leave + payback). Income tax is 0.
 */
export function baseSalaryPayslip(args: {
  salary: SalaryInput;
  intern: boolean;
  dateOfBirth: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  month: number;
  year: number;
  /** No Pay Leave days in the month. */
  unpaidDays?: number;
  /** Interns: MC days in the month (unpaid). Ignored for staff, whose MC is paid. */
  mcDays?: number;
  paybackDays?: number;
}): BaseSalaryResult {
  const { payPeriodStart, payPeriodEnd } = payPeriod(args.month, args.year);
  const monthlyBasic = Number(args.salary.basicSalary);
  const monthlyAllowances = Number(args.salary.allowances ?? 0);
  const monthly = monthlyBasic + monthlyAllowances;
  // No base salary on file (e.g. trainers or directors paid otherwise): nothing to pay from.
  if (!(monthly > 0)) return { ok: false, reason: "no base salary set" };

  let basic = monthlyBasic;
  let allowances = monthlyAllowances;
  if (!args.intern && args.startDate) {
    const start = new Date(args.startDate);
    const end = args.endDate ? new Date(args.endDate) : new Date(8640000000000000);
    if (start > payPeriodStart || end < payPeriodEnd) {
      basic = prorateMonthlySalary(basic, start, end, payPeriodStart, payPeriodEnd).amount;
      allowances = prorateMonthlySalary(allowances, start, end, payPeriodStart, payPeriodEnd).amount;
    }
  }
  const base = money(new Decimal(basic).plus(allowances));
  if (base <= 0) return { ok: false, reason: "no working days in the month" };

  const cpfApplicable = !args.intern && (args.salary.cpfApplicable ?? true);
  // CPF depends on age; without a date of birth it cannot be worked out. Interns pay none.
  if (cpfApplicable && !args.dateOfBirth) return { ok: false, reason: "no date of birth for CPF" };

  const unpaidDays = Math.max(0, args.unpaidDays ?? 0);
  const paybackDays = Math.max(0, args.paybackDays ?? 0);
  const workingDays = countWorkingDays(payPeriodStart, payPeriodEnd);

  if (args.intern) {
    // Interns: take-home = (working days − No Pay Leave − MC + Payback) × gross ÷ working days,
    // rounded down to a whole dollar (hard-coded, src/lib/intern-pay.ts).
    const f = internPayslipFigures({
      monthlyAllowance: monthly,
      workingDays,
      nplDays: unpaidDays,
      mcDays: Math.max(0, args.mcDays ?? 0),
      paybackDays,
    });
    // No Pay Leave + MC (+ the cents dropped by rounding down): gross − total + payback = take-home.
    const unpaidTotal = f.totalDeductions;
    return {
      ok: true,
      payroll: {
        basicSalary: money(basic),
        allowances: money(allowances),
        overtime: 0,
        bonus: 0,
        grossSalary: f.grossSalary,
        unpaidLeaveDays: new Decimal(f.nplDays).plus(f.mcDays).toNumber(),
        unpaidLeaveDeduction: unpaidTotal,
        nplDays: f.nplDays,
        nplDeduction: f.nplDeduction,
        mcDays: f.mcDays,
        mcDeduction: f.mcDeduction,
        paybackDays: f.paybackDays,
        paybackAmount: f.paybackAmount,
        cpfEmployee: 0,
        cpfEmployer: 0,
        incomeTax: 0,
        otherDeductions: 0,
        totalDeductions: unpaidTotal,
        netSalary: f.netSalary,
      },
    };
  }

  const dayRate = workingDays > 0 ? new Decimal(monthly).div(workingDays) : new Decimal(0);
  const deduction = Math.min(base, money(dayRate.times(unpaidDays)));
  const payback = money(dayRate.times(paybackDays));
  const gross = base;
  const wages = money(new Decimal(gross).minus(deduction).plus(payback));

  let cpfEmployee = 0;
  let cpfEmployer = 0;
  if (cpfApplicable && wages > 0) {
    const cpf = calculatePayroll(wages, 0, args.dateOfBirth as Date, 0, 0, 0, 0, { cpfApplicable: true });
    cpfEmployee = cpf.cpfEmployee;
    cpfEmployer = cpf.cpfEmployer;
  }
  const totalDeductions = money(new Decimal(cpfEmployee).plus(deduction));
  return {
    ok: true,
    payroll: {
      basicSalary: money(basic),
      allowances: money(allowances),
      overtime: 0,
      bonus: 0,
      grossSalary: gross,
      unpaidLeaveDays: unpaidDays,
      unpaidLeaveDeduction: deduction,
      nplDays: unpaidDays,
      nplDeduction: deduction,
      mcDays: 0,
      mcDeduction: 0,
      paybackDays,
      paybackAmount: payback,
      cpfEmployee,
      cpfEmployer,
      incomeTax: 0,
      otherDeductions: 0,
      totalDeductions,
      netSalary: money(new Decimal(gross).plus(payback).minus(totalDeductions)),
    },
  };
}

/** Leave types that are unpaid: No Pay Leave for everyone; interns have no paid MC (Alfred, 26 Nov 2026). */
export function unpaidLeaveCodes(intern: boolean): string[] {
  return intern ? [NPL_CODE, ...MEDICAL_LEAVE_CODES] : [NPL_CODE];
}

/**
 * Unpaid days inside the month (pure): each approved request's charged days (Mon–Fri, not a
 * public holiday; `nplDaysOfRequest`) that fall in the month. Paybacks are not netted here:
 * the payslip adds them back on their own line (`paybackDays`).
 */
export function unpaidDaysInMonth(
  requests: { startDate: Date; endDate: Date; days: number }[],
  month: number,
  year: number,
  holidays: ReadonlySet<string> = new Set(),
): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  let total = new Decimal(0);
  for (const r of requests) {
    for (const day of nplDaysOfRequest(r, holidays)) {
      if (day.date.startsWith(prefix)) total = total.plus(day.days);
    }
  }
  return total.toNumber();
}

/** Leave dates are stored as UTC calendar dates: the month as a UTC range. */
function utcMonth(month: number, year: number) {
  return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 0, 23, 59, 59)) };
}

/**
 * Unpaid days taken in the month, from the database, split into No Pay Leave and MC with the same
 * rule as the person page (`payMonthLeaveFigures`): an intern's MC, including the No Pay Leave filed
 * for it ("Sick leave (MC) — …"), is MC; staff MC is paid, so staff have No Pay Leave only.
 */
export async function loadUnpaidDays(
  employeeId: string,
  intern: boolean,
  month: number,
  year: number,
  holidays: ReadonlySet<string>,
): Promise<{ nplDays: number; mcDays: number }> {
  const { from, to } = utcMonth(month, year);
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      leaveType: { code: { in: unpaidLeaveCodes(intern) } },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { startDate: true, endDate: true, days: true, reason: true, leaveType: { select: { code: true } } },
  });
  const f = payMonthLeaveFigures(
    requests.map((r) => ({ code: r.leaveType.code, reason: r.reason, startDate: r.startDate, endDate: r.endDate, days: Number(r.days) })),
    intern,
    month,
    year,
    holidays,
  );
  return { nplDays: f.noPayLeaveDays, mcDays: intern ? f.mcDays : 0 };
}

/** Approved paybacks worked (off days) in the month: added back on that month's payslip. */
export async function loadPaybackDays(employeeId: string, month: number, year: number): Promise<number> {
  const { from, to } = utcMonth(month, year);
  try {
    const sum = await prisma.nplPayback.aggregate({
      where: { employeeId, status: "APPROVED", workDate: { gte: from, lte: to } },
      _sum: { days: true },
    });
    return Number(sum._sum.days ?? 0);
  } catch {
    return 0;
  }
}

/** True when a CPF statement for the month was uploaded (recorded on a payslip, or archived on Drive). */
export async function cpfUploadedFor(month: number, year: number): Promise<boolean> {
  const { payPeriodStart, payPeriodEnd } = payPeriod(month, year);
  const recorded = await prisma.payslip.count({
    where: { payPeriodStart, payPeriodEnd, cpfSubmissionFileId: { not: null } },
  });
  if (recorded > 0) return true;
  try {
    const files = await listCpfSubmissionFiles();
    return files.some((f) => f.month === month && f.year === year);
  } catch (err) {
    console.error("[payroll-month-end] Drive check for a CPF statement failed:", err);
    return false;
  }
}

export const BASE_SALARY_SOURCE = "BASE_SALARY";

/** Payslip columns written from base-salary figures. */
function payslipData(p: BaseSalaryFigures) {
  return {
    basicSalary: p.basicSalary,
    allowances: p.allowances,
    overtime: p.overtime,
    bonus: p.bonus,
    grossSalary: p.grossSalary,
    cpfEmployee: p.cpfEmployee,
    cpfEmployer: p.cpfEmployer,
    incomeTax: p.incomeTax,
    otherDeductions: p.otherDeductions,
    unpaidLeaveDays: p.unpaidLeaveDays,
    unpaidLeaveDeduction: p.unpaidLeaveDeduction,
    nplDays: p.nplDays,
    nplDeduction: p.nplDeduction,
    mcDays: p.mcDays,
    mcDeduction: p.mcDeduction,
    paybackDays: p.paybackDays,
    paybackAmount: p.paybackAmount,
    totalDeductions: p.totalDeductions,
    netSalary: p.netSalary,
    source: BASE_SALARY_SOURCE,
  };
}

const FIGURE_KEYS = [
  "grossSalary", "cpfEmployee", "cpfEmployer", "unpaidLeaveDays", "unpaidLeaveDeduction",
  "nplDays", "nplDeduction", "mcDays", "mcDeduction",
  "paybackDays", "paybackAmount", "totalDeductions", "netSalary", "basicSalary", "allowances",
] as const;

/** True when a stored payslip already has these figures (Decimal-safe). */
function sameFigures(stored: Record<string, unknown>, p: BaseSalaryFigures): boolean {
  return FIGURE_KEYS.every((k) => Number(stored[k]) === Number(p[k]));
}

/** Base-salary figures for one person and month, with their leave and paybacks loaded. */
async function figuresFor(
  employee: {
    id: string;
    employmentType: string;
    dateOfBirth: Date | null;
    startDate: Date | null;
    endDate: Date | null;
    salaryInfo: SalaryInput | null;
    user?: { roles: string[] } | null;
  },
  month: number,
  year: number,
  holidays: ReadonlySet<string>,
): Promise<{ intern: boolean; result: BaseSalaryResult }> {
  const intern = isInternEmployee({ employmentType: employee.employmentType, roles: employee.user?.roles });
  if (!employee.salaryInfo) return { intern, result: { ok: false, reason: "no base salary set" } };
  const result = baseSalaryPayslip({
    salary: employee.salaryInfo,
    intern,
    dateOfBirth: employee.dateOfBirth,
    startDate: employee.startDate,
    endDate: employee.endDate,
    month,
    year,
    ...(await loadUnpaidDays(employee.id, intern, month, year, holidays).then((u) => ({ unpaidDays: u.nplDays, mcDays: u.mcDays }))),
    paybackDays: await loadPaybackDays(employee.id, month, year),
  });
  return { intern, result };
}

/**
 * After a salary edit: re-work an existing base-salary payslip for the month with the shared
 * rule (leave, paybacks, no CPF for interns). Never touches a CPF or manual payslip and never
 * creates one: the month-end run makes payslips once the month is over.
 */
export async function refreshBaseSalaryPayslip(
  employeeId: string,
  month: number,
  year: number,
): Promise<{ payslipUpdated: boolean; payslipId?: string; reason?: string }> {
  const { payPeriodStart, payPeriodEnd } = payPeriod(month, year);
  const existing = await prisma.payslip.findUnique({
    where: { employeeId_payPeriodStart_payPeriodEnd: { employeeId, payPeriodStart, payPeriodEnd } },
  });
  if (!existing) return { payslipUpdated: false, reason: "no payslip for the month yet (made at month end)" };
  if (existing.status === "PAID") return { payslipUpdated: false, reason: "payslip is already paid" };
  if (existing.source !== BASE_SALARY_SOURCE) {
    return { payslipUpdated: false, reason: existing.source === "CPF" ? "payslip is from the CPF statement" : "payslip was not made from base salary" };
  }
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { salaryInfo: true, user: { select: { roles: true } } },
  });
  if (!employee) return { payslipUpdated: false, reason: "employee not found" };
  const { result } = await figuresFor(employee, month, year, await holidayKeys([year]));
  if (!result.ok) return { payslipUpdated: false, reason: result.reason };
  const updated = await prisma.payslip.update({ where: { id: existing.id }, data: payslipData(result.payroll) });
  return { payslipUpdated: true, payslipId: updated.id };
}

export interface BaseSalaryRun {
  ok: true;
  month: number;
  year: number;
  cpfUploaded: boolean;
  created: number;
  /** Base-salary payslips of the month re-worked because leave, paybacks or pay changed. */
  refreshed: number;
  skippedExisting: number;
  /** Staff left to the CPF statement because it was uploaded (no payslip yet). */
  staffNotOnCpf: string[];
  /** People with no payslip and no way to make one (no date of birth for CPF, …). */
  problems: string[];
  errors: number;
  summary: string;
  /** Dry run only: "Name: gross / CPF EE / net". */
  planned?: string[];
}

export async function generateBaseSalaryPayslips(opts: {
  month: number;
  year: number;
  /** Work everything out but write nothing; `planned` lists who would be paid. */
  dryRun?: boolean;
  /**
   * Only these people (Employee.id), whatever their status: back-pay for someone who has left,
   * for any month between their start and end dates. Everyone else is left alone.
   */
  onlyEmployeeIds?: string[];
}): Promise<BaseSalaryRun> {
  const { month, year } = opts;
  const { payPeriodStart, payPeriodEnd, paymentDate } = payPeriod(month, year);
  const cpfUploaded = await cpfUploadedFor(month, year);

  // Active people, plus anyone whose last day fell in the month (an intern who finished on the
  // 15th is deactivated by then but is still paid). Not someone inactive with a stale future end date.
  const employees = await prisma.employee.findMany({
    where: opts.onlyEmployeeIds
      ? {
          id: { in: opts.onlyEmployeeIds },
          salaryInfo: { isNot: null },
          AND: [
            { OR: [{ startDate: null }, { startDate: { lte: payPeriodEnd } }] },
            { OR: [{ endDate: null }, { endDate: { gte: payPeriodStart } }] },
          ],
        }
      : {
          salaryInfo: { isNot: null },
          OR: [{ status: "ACTIVE" }, { endDate: { gte: payPeriodStart, lte: payPeriodEnd } }],
          AND: [{ OR: [{ startDate: null }, { startDate: { lte: payPeriodEnd } }] }],
        },
    include: { salaryInfo: true, user: { select: { roles: true } } },
    orderBy: { name: "asc" },
  });
  const holidays = await holidayKeys([year]);
  const existing = new Map(
    (await prisma.payslip.findMany({ where: { payPeriodStart, payPeriodEnd } })).map((p) => [p.employeeId, p]),
  );

  const run: BaseSalaryRun = {
    ok: true,
    month,
    year,
    cpfUploaded,
    created: 0,
    refreshed: 0,
    skippedExisting: 0,
    staffNotOnCpf: [],
    problems: [],
    errors: 0,
    summary: "",
  };

  for (const employee of employees) {
    if (!employee.salaryInfo) continue;
    const intern = isInternEmployee({ employmentType: employee.employmentType, roles: employee.user?.roles });
    const current = existing.get(employee.id);
    // A CPF, Excel or older payslip is final. A base-salary one is re-checked (leave or paybacks
    // added after it was made), except staff once the month's CPF statement is in.
    if (current && (current.source !== BASE_SALARY_SOURCE || current.status === "PAID" || (cpfUploaded && !intern))) {
      run.skippedExisting++;
      continue;
    }
    if (!current && cpfUploaded && !intern) {
      run.staffNotOnCpf.push(employee.name);
      continue;
    }
    const { result } = await figuresFor(employee, month, year, holidays);
    if (!result.ok) {
      if (!current) run.problems.push(`${employee.name}: ${result.reason}`);
      else run.skippedExisting++;
      continue;
    }
    const p = result.payroll;
    if (current && sameFigures(current as unknown as Record<string, unknown>, p)) {
      run.skippedExisting++;
      continue;
    }
    if (opts.dryRun) {
      (run.planned ??= []).push(
        `${employee.name}${intern ? " (intern)" : ""}: base ${money(new Decimal(p.basicSalary).plus(p.allowances))}` +
          (p.paybackDays ? `, payback ${p.paybackDays}d +${p.paybackAmount}` : "") +
          `, gross ${p.grossSalary}` +
          (p.unpaidLeaveDays ? `, unpaid ${p.unpaidLeaveDays}d -${p.unpaidLeaveDeduction}` : "") +
          `, CPF EE ${p.cpfEmployee} ER ${p.cpfEmployer}, take-home ${p.netSalary}` +
          (current ? " (update)" : ""),
      );
      if (current) run.refreshed++;
      else run.created++;
      continue;
    }
    try {
      if (current) await prisma.payslip.update({ where: { id: current.id }, data: payslipData(p) });
      else await prisma.payslip.create({
            data: {
              id: `ps_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              employeeId: employee.id,
              payPeriodStart,
              payPeriodEnd,
              paymentDate,
              status: "GENERATED",
              ...payslipData(p),
            },
          });
      if (current) run.refreshed++;
      else run.created++;
    } catch (err) {
      console.error(`[payroll-month-end] payslip for ${employee.id} failed:`, err);
      run.errors++;
      run.problems.push(`${employee.name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const label = `${MONTHS[month - 1]} ${year}`;
  run.summary =
    `${label}: ${run.created} base-salary payslip${run.created === 1 ? "" : "s"} created` +
    (run.refreshed ? `, ${run.refreshed} updated for leave or paybacks` : "") +
    (cpfUploaded ? " (CPF statement uploaded: interns only)" : " (no CPF statement uploaded)") +
    (run.staffNotOnCpf.length ? `, ${run.staffNotOnCpf.length} staff not on the CPF statement` : "") +
    (run.problems.length ? `, ${run.problems.length} need attention` : "");
  return run;
}

/** The month just ended, when the Singapore date is the 1st–3rd; otherwise null. */
export function monthEndTarget(now: Date = new Date()): { month: number; year: number } | null {
  const sg = new Date(now.getTime() + 8 * 3600_000);
  if (sg.getUTCDate() > 3) return null;
  const m = sg.getUTCMonth(); // 0-based current month = 1-based previous month
  return m === 0 ? { month: 12, year: sg.getUTCFullYear() - 1 } : { month: m, year: sg.getUTCFullYear() };
}

/** Roll-up hook: on the 1st–3rd (SGT), pay the month just ended. A no-op the rest of the month. */
export async function monthEndPayroll(now: Date = new Date()): Promise<Record<string, unknown>> {
  const target = monthEndTarget(now);
  if (!target) return { payroll: "skipped (not the 1st–3rd)" };
  const run = await generateBaseSalaryPayslips(target);

  if (run.created > 0 || run.refreshed > 0 || run.staffNotOnCpf.length > 0 || run.problems.length > 0) {
    const label = `${MONTHS[target.month - 1]} ${target.year}`;
    const list = (title: string, items: string[]) =>
      items.length
        ? `<p><b>${escapeHtml(title)}</b></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
        : "";
    await notifyAdmins({
      title: `Payroll for ${label}`,
      message: run.summary,
      type: "PAYROLL_MONTH_END",
      link: "/payroll",
      subject: `Payroll for ${label}: ${run.cpfUploaded ? "from the CPF statement" : "from base salary (no CPF statement uploaded)"}`,
      html:
        `<p>${escapeHtml(run.summary)}.</p>` +
        (run.cpfUploaded
          ? ""
          : `<p>No CPF statement was uploaded for ${escapeHtml(label)}, so payslips were made from each person's base salary. ` +
            `Uploading the CPF statement on Payroll → Upload CPF replaces the staff payslips with the filed figures.</p>`) +
        list("Staff not on the CPF statement (no payslip made)", run.staffNotOnCpf) +
        list("Needs attention", run.problems),
    }).catch((err) => console.error("[payroll-month-end] admin notice failed:", err));
  }

  return {
    payroll: run.summary,
    payrollCreated: run.created,
    payrollCpfUploaded: run.cpfUploaded,
    payrollStaffNotOnCpf: run.staffNotOnCpf.length,
    payrollProblems: run.problems.length,
  };
}
