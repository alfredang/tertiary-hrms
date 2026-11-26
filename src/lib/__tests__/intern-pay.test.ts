import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { INTERN_PAY_FORMULA, internPaidDays, internPayslipFigures, internTakeHome } from "@/lib/intern-pay";

// HARD RULE (Alfred, 26 Nov 2026): intern take-home pay =
//   (working days − No Pay Leave − MC + Payback) × Allowance ÷ working days, rounded down to a whole dollar.
// Interns have no CPF: the term is "Allowance", never "Gross pay".
describe("intern pay formula (hard-coded)", () => {
  it("is the formula Alfred set", () => {
    expect(INTERN_PAY_FORMULA).toBe(
      "Take-home pay = (working days − No Pay Leave − MC + Payback) × Allowance ÷ working days, rounded down to a whole dollar",
    );
  });

  it("follows Alfred's example: 20 working days", () => {
    // (20 − 1 − 2 + 1) × 1000 ÷ 20 = 900
    expect(internTakeHome({ gross: 1000, workingDays: 20, nplDays: 1, mcDays: 2, paybackDays: 1 })).toBe(900);
    // (20 − 0 − 1 + 0) × 600 ÷ 20 = 570
    expect(internTakeHome({ gross: 600, workingDays: 20, nplDays: 0, mcDays: 1, paybackDays: 0 })).toBe(570);
    // Nothing taken: the full allowance.
    expect(internTakeHome({ gross: 1000, workingDays: 20, nplDays: 0, mcDays: 0, paybackDays: 0 })).toBe(1000);
  });

  it("rounds DOWN to a whole dollar", () => {
    // (22 − 4) × 1000 ÷ 22 = 818.18 → 818
    expect(internTakeHome({ gross: 1000, workingDays: 22, nplDays: 1, mcDays: 3, paybackDays: 0 })).toBe(818);
    // (21 − 1) × 600 ÷ 21 = 571.43 → 571
    expect(internTakeHome({ gross: 600, workingDays: 21, nplDays: 0.5, mcDays: 0.5, paybackDays: 0 })).toBe(571);
    // (22 − 1 + 0) × 1000 ÷ 22 = 954.545… → 954 (never rounded up)
    expect(internTakeHome({ gross: 1000, workingDays: 22, nplDays: 1, mcDays: 0, paybackDays: 0 })).toBe(954);
  });

  it("counts paid days as working days − No Pay Leave − MC + Payback, never below 0", () => {
    expect(internPaidDays({ workingDays: 20, nplDays: 1, mcDays: 2, paybackDays: 1 })).toBe(18);
    expect(internPaidDays({ workingDays: 20, nplDays: 15, mcDays: 10, paybackDays: 0 })).toBe(0);
    expect(internTakeHome({ gross: 600, workingDays: 20, nplDays: 15, mcDays: 10, paybackDays: 0 })).toBe(0);
  });

  it("gives payslip lines that add up to the take-home", () => {
    const f = internPayslipFigures({ monthlyAllowance: 1000, workingDays: 22, nplDays: 1, mcDays: 4, paybackDays: 1 });
    expect(f.grossSalary).toBe(1000);
    expect(f.paidDays).toBe(18);
    expect(f.nplDeduction).toBe(45.45);
    expect(f.mcDeduction).toBe(181.82);
    expect(f.paybackAmount).toBe(45.45);
    expect(f.netSalary).toBe(818);
    expect(f.roundingDown).toBe(0.18);
    expect(f.grossSalary - f.nplDeduction - f.mcDeduction + f.paybackAmount - f.roundingDown).toBeCloseTo(f.netSalary, 2);
    expect(f.grossSalary - f.totalDeductions + f.paybackAmount).toBeCloseTo(f.netSalary, 2);
  });

  it("is what the month-end payslip run uses for interns", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/payroll-month-end.ts"), "utf8");
    expect(src).toContain("internPayslipFigures(");
  });
});
