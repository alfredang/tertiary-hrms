import Decimal from "decimal.js";

/**
 * HARD RULE — the intern payslip formula (Alfred, 26 Nov 2026). Do not change it without Alfred.
 *
 *     Take-home pay = (working days − No Pay Leave − MC + Payback) × Allowance ÷ working days,
 *                     rounded DOWN to a whole dollar
 *
 *   e.g. 20 working days, $1,000, 1 No Pay Leave, 2 MC, 1 payback:
 *        (20 − 1 − 2 + 1) × 1000 ÷ 20 = $900
 *
 *  - Working days = Mon–Fri days in the month.
 *  - Allowance    = the flat monthly allowance (the intern's own figure on file). Never
 *                   more, never prorated, no CPF (employee or employer), income tax 0. Interns have no
 *                   CPF, so it is called "Allowance", never "Gross pay", on every intern screen and
 *                   payslip (Alfred, 26 Nov 2026). Stored in Payslip.grossSalary.
 *  - No Pay Leave = No Pay Leave days in the month.
 *  - MC           = MC days in the month (interns have no paid MC), including the No Pay Leave the
 *                   API files for an intern's MC ("Sick leave (MC) — …").
 *  - Payback      = approved off days worked in the month.
 *
 * Every intern payslip goes through `internPayslipFigures()`; the payslip PDF, the web payroll page
 * and the apps show these lines and this formula. Locked by src/lib/__tests__/intern-pay.test.ts.
 */
export const INTERN_PAY_FORMULA =
  "Take-home pay = (working days − No Pay Leave − MC + Payback) × Allowance ÷ working days, rounded down to a whole dollar";

const cents = (d: Decimal.Value) => new Decimal(d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/** The days the intern is paid for: working days − No Pay Leave − MC + Payback (never below 0). */
export function internPaidDays(a: { workingDays: number; nplDays: number; mcDays: number; paybackDays: number }): number {
  return Decimal.max(0, new Decimal(a.workingDays).minus(a.nplDays).minus(a.mcDays).plus(a.paybackDays)).toNumber();
}

/** Take-home pay = (working days − No Pay Leave − MC + Payback) × Allowance ÷ working days, rounded down. */
export function internTakeHome(a: {
  gross: number;
  workingDays: number;
  nplDays: number;
  mcDays: number;
  paybackDays: number;
}): number {
  if (!(a.workingDays > 0)) return new Decimal(a.gross).floor().toNumber();
  return new Decimal(internPaidDays(a)).times(a.gross).div(a.workingDays).floor().toNumber();
}

export interface InternPayFigures {
  grossSalary: number;
  workingDays: number;
  nplDays: number;
  /** For the payslip line: No Pay Leave days × gross ÷ working days, to the cent. */
  nplDeduction: number;
  mcDays: number;
  mcDeduction: number;
  paybackDays: number;
  paybackAmount: number;
  /** Working days − No Pay Leave − MC + Payback. */
  paidDays: number;
  /** The cents dropped by rounding down (shown as its own line so the lines add up). */
  roundingDown: number;
  /** Allowance − take-home + payback: the No Pay Leave, MC and rounding lines together. */
  totalDeductions: number;
  netSalary: number;
}

/** One intern's month, by the hard-coded formula. */
export function internPayslipFigures(a: {
  monthlyAllowance: number;
  workingDays: number;
  nplDays: number;
  mcDays: number;
  paybackDays: number;
}): InternPayFigures {
  const gross = cents(a.monthlyAllowance);
  const nplDays = Math.max(0, a.nplDays);
  const mcDays = Math.max(0, a.mcDays);
  const paybackDays = Math.max(0, a.paybackDays);
  const workingDays = a.workingDays;
  const net = internTakeHome({ gross, workingDays, nplDays, mcDays, paybackDays });
  const rate = workingDays > 0 ? new Decimal(gross).div(workingDays) : new Decimal(0);
  const nplDeduction = cents(rate.times(nplDays));
  const mcDeduction = cents(rate.times(mcDays));
  const paybackAmount = cents(rate.times(paybackDays));
  // Lines add up: gross − No Pay Leave − MC + payback − rounding = take-home.
  const totalDeductions = cents(new Decimal(gross).plus(paybackAmount).minus(net));
  const roundingDown = cents(new Decimal(totalDeductions).minus(nplDeduction).minus(mcDeduction));
  return {
    grossSalary: gross,
    workingDays,
    nplDays,
    nplDeduction,
    mcDays,
    mcDeduction,
    paybackDays,
    paybackAmount,
    paidDays: internPaidDays({ workingDays, nplDays, mcDays, paybackDays }),
    roundingDown,
    totalDeductions,
    netSalary: net,
  };
}
