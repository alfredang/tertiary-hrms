import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin-alerts", () => ({ escapeHtml: (s: string) => s, notifyAdmins: vi.fn() }));
vi.mock("@/lib/cpf-submission-files", () => ({ listCpfSubmissionFiles: vi.fn() }));
vi.mock("@/lib/npl-payback-store", () => ({ holidayKeys: vi.fn(async () => new Set()) }));

import {
  baseSalaryPayslip,
  isInternEmployee,
  monthEndTarget,
  unpaidDaysInMonth,
  unpaidLeaveCodes,
} from "@/lib/payroll-month-end";

describe("isInternEmployee", () => {
  it("is an intern by employment type or roles exactly INTERN", () => {
    expect(isInternEmployee({ employmentType: "INTERN", roles: ["STAFF"] })).toBe(true);
    expect(isInternEmployee({ employmentType: "FULL_TIME", roles: ["INTERN"] })).toBe(true);
    expect(isInternEmployee({ employmentType: "FULL_TIME", roles: ["STAFF", "INTERN"] })).toBe(false);
    expect(isInternEmployee({ employmentType: "PART_TIME", roles: ["STAFF"] })).toBe(false);
  });
});

describe("baseSalaryPayslip", () => {
  const full = { startDate: new Date(2024, 0, 1), endDate: null, month: 10, year: 2026 };

  it("gives interns CPF 0 and no income tax, even without a date of birth", () => {
    const r = baseSalaryPayslip({ ...full, salary: { basicSalary: 1000, allowances: 0 }, intern: true, dateOfBirth: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.grossSalary).toBe(1000);
    expect(r.payroll.cpfEmployee).toBe(0);
    expect(r.payroll.cpfEmployer).toBe(0);
    expect(r.payroll.incomeTax).toBe(0);
    expect(r.payroll.netSalary).toBe(1000);
  });

  it("works out staff CPF from base salary with no income tax", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 3500, allowances: 0, cpfApplicable: true },
      intern: false,
      dateOfBirth: new Date(1990, 0, 1),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.grossSalary).toBe(3500);
    expect(r.payroll.cpfEmployee).toBe(700); // 20% under 55
    expect(r.payroll.cpfEmployer).toBe(595); // 17%
    expect(r.payroll.incomeTax).toBe(0);
    expect(r.payroll.netSalary).toBe(2800);
  });

  it("skips a person with no base salary set", () => {
    const r = baseSalaryPayslip({ ...full, salary: { basicSalary: 0, allowances: 0 }, intern: false, dateOfBirth: new Date(1980, 0, 1) });
    expect(r).toEqual({ ok: false, reason: "no base salary set" });
  });

  it("cannot work out staff CPF without a date of birth", () => {
    const r = baseSalaryPayslip({ ...full, salary: { basicSalary: 3000, allowances: 0 }, intern: false, dateOfBirth: null });
    expect(r).toEqual({ ok: false, reason: "no date of birth for CPF" });
  });

  it("skips CPF for staff marked not CPF-applicable", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 1200, allowances: 0, cpfApplicable: false },
      intern: false,
      dateOfBirth: null,
    });
    expect(r.ok && r.payroll.cpfEmployee).toBe(0);
  });

  it("pays interns the flat amount even for a part month", () => {
    const r = baseSalaryPayslip({
      salary: { basicSalary: 0, allowances: 600 },
      intern: true,
      dateOfBirth: null,
      startDate: new Date(2026, 9, 7), // joined 7 Oct
      endDate: null,
      month: 10,
      year: 2026,
    });
    expect(r.ok && r.payroll.grossSalary).toBe(600);
  });

  it("prorates staff for a part month", () => {
    const r = baseSalaryPayslip({
      salary: { basicSalary: 3000, allowances: 0 },
      intern: false,
      dateOfBirth: new Date(1990, 0, 1),
      startDate: new Date(2026, 9, 15),
      endDate: null,
      month: 10,
      year: 2026,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.grossSalary).toBeGreaterThan(0);
    expect(r.payroll.grossSalary).toBeLessThan(3000);
  });

  // October 2026 has 22 Mon–Fri days. Interns: take-home = (22 − No Pay Leave − MC + payback)
  // × allowance ÷ 22, rounded down to a whole dollar (src/lib/intern-pay.ts).
  it("deducts an intern's No Pay Leave and MC as their own lines, by the intern formula", () => {
    const r = baseSalaryPayslip({ ...full, salary: { basicSalary: 0, allowances: 1000 }, intern: true, dateOfBirth: null, unpaidDays: 1, mcDays: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.nplDays).toBe(1);
    expect(r.payroll.mcDays).toBe(1);
    expect(r.payroll.nplDeduction).toBe(45.45);
    expect(r.payroll.mcDeduction).toBe(45.45);
    expect(r.payroll.unpaidLeaveDays).toBe(2);
    expect(r.payroll.grossSalary).toBe(1000);
    expect(r.payroll.netSalary).toBe(909); // (22 − 1 − 1) × 1000 ÷ 22 = 909.09 → 909
    expect(r.payroll.totalDeductions).toBe(91); // 45.45 + 45.45 + 0.09 rounding down
    expect(r.payroll.cpfEmployee).toBe(0);
  });

  it("adds paybacks back to take-home, never to gross (gross = the flat allowance only)", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 0, allowances: 600 },
      intern: true,
      dateOfBirth: null,
      unpaidDays: 2,
      paybackDays: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.paybackDays).toBe(1);
    expect(r.payroll.paybackAmount).toBe(27.27); // 600 / 22
    expect(r.payroll.grossSalary).toBe(600);
    expect(r.payroll.netSalary).toBe(572); // (22 − 2 + 1) × 600 ÷ 22 = 572.72 → 572
    // Lines add up: gross − deductions + payback = take-home.
    expect(r.payroll.grossSalary - r.payroll.totalDeductions + r.payroll.paybackAmount).toBeCloseTo(572, 2);
  });

  // Oct 2026 case (Alfred, 26 Nov 2026): gross was shown as $1,045.45; it is $1,000 only.
  it("keeps a $1,000 intern's gross at $1,000 with No Pay Leave, MC and a payback", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 0, allowances: 1000 },
      intern: true,
      dateOfBirth: null,
      unpaidDays: 1,
      mcDays: 4,
      paybackDays: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.grossSalary).toBe(1000);
    expect(r.payroll.netSalary).toBe(818); // (22 − 1 − 4 + 1) × 1000 ÷ 22 = 818.18 → 818
  });

  it("ignores mcDays for staff (their MC is paid)", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 2200, allowances: 0 },
      intern: false,
      dateOfBirth: new Date(1990, 0, 1),
      mcDays: 3,
    });
    expect(r.ok && r.payroll.mcDays).toBe(0);
    expect(r.ok && r.payroll.netSalary).toBe(1760); // 2200 − 20% CPF
  });

  it("works out staff CPF on the pay earned after No Pay Leave and payback", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 2200, allowances: 0 },
      intern: false,
      dateOfBirth: new Date(1990, 0, 1),
      unpaidDays: 2,
      paybackDays: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.grossSalary).toBe(2200);
    expect(r.payroll.cpfEmployee).toBe(420); // 20% of 2200 − 200 + 100
    expect(r.payroll.netSalary).toBe(1680); // 2200 − 200 − 420 + 100
  });

  it("works out staff CPF on the pay left after No Pay Leave", () => {
    const r = baseSalaryPayslip({
      ...full,
      salary: { basicSalary: 2200, allowances: 0 },
      intern: false,
      dateOfBirth: new Date(1990, 0, 1),
      unpaidDays: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payroll.unpaidLeaveDeduction).toBe(100); // 2200 / 22
    expect(r.payroll.cpfEmployee).toBe(420); // 20% of 2100
    expect(r.payroll.netSalary).toBe(1680); // 2200 − 100 − 420
  });

  it("never deducts more than the month's pay", () => {
    const r = baseSalaryPayslip({ ...full, salary: { basicSalary: 0, allowances: 600 }, intern: true, dateOfBirth: null, unpaidDays: 30 });
    expect(r.ok && r.payroll.netSalary).toBe(0);
  });
});

describe("monthEndTarget", () => {
  // Times are UTC; the rule reads the Singapore date (UTC+8).
  it("targets the month just ended on the 1st–3rd (SGT)", () => {
    expect(monthEndTarget(new Date("2026-11-30T16:30:00Z"))).toEqual({ month: 11, year: 2026 }); // 1 Dec 00:30 SGT
    expect(monthEndTarget(new Date("2026-12-03T00:30:00Z"))).toEqual({ month: 11, year: 2026 });
    expect(monthEndTarget(new Date("2027-01-01T00:30:00Z"))).toEqual({ month: 12, year: 2026 });
  });
  it("does nothing the rest of the month", () => {
    expect(monthEndTarget(new Date("2026-11-30T15:00:00Z"))).toBeNull(); // 30 Nov 23:00 SGT
    expect(monthEndTarget(new Date("2026-12-04T00:30:00Z"))).toBeNull();
  });
});

describe("unpaid leave", () => {
  it("counts MC as unpaid for interns only", () => {
    expect(unpaidLeaveCodes(true)).toEqual(expect.arrayContaining(["NPL", "MC"]));
    expect(unpaidLeaveCodes(false)).toEqual(["NPL"]);
  });

  it("counts only the charged days that fall in the month", () => {
    const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
    const requests = [
      { startDate: d("2026-10-30"), endDate: d("2026-11-03"), days: 3 }, // Fri 30 Oct, Mon 2, Tue 3 Nov
      { startDate: d("2026-11-10"), endDate: d("2026-11-10"), days: 0.5 },
    ];
    expect(unpaidDaysInMonth(requests, 11, 2026)).toBe(2.5);
    expect(unpaidDaysInMonth(requests, 10, 2026)).toBe(1);
  });
});
