import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getCPFRates,
  calculateAge,
  calculateCPF,
  calculatePayroll,
} from "@/lib/cpf-calculator";

// ---- getCPFRates ----

describe("getCPFRates — age-based contribution rates", () => {
  it("should return 20/17 for age ≤ 55", () => {
    const rates = getCPFRates(30);
    expect(rates.employee.toNumber()).toBe(20);
    expect(rates.employer.toNumber()).toBe(17);
  });

  it("should return 20/17 at exact boundary age 55", () => {
    const rates = getCPFRates(55);
    expect(rates.employee.toNumber()).toBe(20);
    expect(rates.employer.toNumber()).toBe(17);
  });

  it("should return 18/16 for age 56-60", () => {
    const rates = getCPFRates(56);
    expect(rates.employee.toNumber()).toBe(18);
    expect(rates.employer.toNumber()).toBe(16);
  });

  it("should return 18/16 at exact boundary age 60", () => {
    const rates = getCPFRates(60);
    expect(rates.employee.toNumber()).toBe(18);
    expect(rates.employer.toNumber()).toBe(16);
  });

  it("should return 12.5/12.5 for age 61-65", () => {
    const rates = getCPFRates(63);
    expect(rates.employee.toNumber()).toBe(12.5);
    expect(rates.employer.toNumber()).toBe(12.5);
  });

  it("should return 12.5/12.5 at exact boundary age 65", () => {
    const rates = getCPFRates(65);
    expect(rates.employee.toNumber()).toBe(12.5);
    expect(rates.employer.toNumber()).toBe(12.5);
  });

  it("should return 7.5/9 for age 66-70", () => {
    const rates = getCPFRates(68);
    expect(rates.employee.toNumber()).toBe(7.5);
    expect(rates.employer.toNumber()).toBe(9);
  });

  it("should return 7.5/9 at exact boundary age 70", () => {
    const rates = getCPFRates(70);
    expect(rates.employee.toNumber()).toBe(7.5);
    expect(rates.employer.toNumber()).toBe(9);
  });

  it("should return 5/7.5 for age > 70", () => {
    const rates = getCPFRates(75);
    expect(rates.employee.toNumber()).toBe(5);
    expect(rates.employer.toNumber()).toBe(7.5);
  });

  it("should return 5/7.5 at exact boundary age 71", () => {
    const rates = getCPFRates(71);
    expect(rates.employee.toNumber()).toBe(5);
    expect(rates.employer.toNumber()).toBe(7.5);
  });
});

// ---- calculateAge ----

describe("calculateAge — age from date of birth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate correct age for a past birthday this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026
    expect(calculateAge(new Date(1990, 2, 10))).toBe(36); // birthday was Mar 10
  });

  it("should calculate correct age when birthday is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026
    expect(calculateAge(new Date(1990, 5, 15))).toBe(36); // birthday is today
  });

  it("should subtract 1 when birthday has not yet occurred this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026
    expect(calculateAge(new Date(1990, 11, 25))).toBe(35); // birthday in Dec
  });

  it("should subtract 1 when birthday is tomorrow (same month)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026
    expect(calculateAge(new Date(1990, 5, 16))).toBe(35); // birthday is June 16
  });

  it("should handle leap year birthday (Feb 29)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 1)); // March 1, 2026 (non-leap year)
    // Born Feb 29, 1996 — by March 1, 2026: 2026-1996=30, monthDiff=1 (positive) → age 30
    expect(calculateAge(new Date(1996, 1, 29))).toBe(30);
  });

  it("should return 0 for a baby born this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026
    expect(calculateAge(new Date(2026, 0, 1))).toBe(0);
  });
});

// ---- calculateCPF ----

describe("calculateCPF — contribution calculations", () => {
  it("should calculate correctly for age ≤ 55, standard wage", () => {
    // $5000 OW, age 30: rates 20%/17%, total rate 37%
    // Total = 5000 * 37% = 1850, Employee = 5000 * 20% = 1000 (round down), Employer = 1850 - 1000 = 850
    const result = calculateCPF(5000, 0, 30);
    expect(result.employeeContribution).toBe(1000);
    expect(result.employerContribution).toBe(850);
    expect(result.totalContribution).toBe(1850);
    expect(result.grossWage).toBe(5000);
  });

  it("should cap ordinary wage at $8,000 monthly ceiling", () => {
    // $10,000 OW → capped at $8,000. Age 30: rates 20%/17%
    // Total = 8000 * 37% = 2960, Employee = 8000 * 20% = 1600, Employer = 2960 - 1600 = 1360
    const result = calculateCPF(10000, 0, 30);
    expect(result.grossWage).toBe(8000); // capped
    expect(result.employeeContribution).toBe(1600);
    expect(result.employerContribution).toBe(1360);
    expect(result.totalContribution).toBe(2960);
  });

  it("should include additional wage in calculations", () => {
    // $5000 OW + $2000 AW, age 30. Capped OW = 5000, AW ceiling = 102000 - 0 - 5000 = 97000, capped AW = 2000
    // Total wage = 7000, Total = 7000 * 37% = 2590, Employee = 7000 * 20% = 1400, Employer = 1190
    const result = calculateCPF(5000, 2000, 30);
    expect(result.grossWage).toBe(7000);
    expect(result.employeeContribution).toBe(1400);
    expect(result.employerContribution).toBe(1190);
    expect(result.totalContribution).toBe(2590);
  });

  it("should apply annual ceiling to additional wage", () => {
    // $8000 OW (max), AW $5000, ytdOW = $90000, age 30
    // AW ceiling = max(102000 - 90000 - 8000, 0) = 4000, capped AW = 4000
    // Total wage = 8000 + 4000 = 12000
    // Total = 12000 * 37% = 4440, Employee = 12000 * 20% = 2400, Employer = 2040
    const result = calculateCPF(8000, 5000, 30, 90000);
    expect(result.grossWage).toBe(12000);
    expect(result.employeeContribution).toBe(2400);
    expect(result.employerContribution).toBe(2040);
    expect(result.totalContribution).toBe(4440);
  });

  it("should return zero AW when annual ceiling is exhausted", () => {
    // $8000 OW, AW $5000, ytdOW = $100000, age 30
    // AW ceiling = max(102000 - 100000 - 8000, 0) = 0
    // Total wage = 8000, same as no AW
    const result = calculateCPF(8000, 5000, 30, 100000);
    expect(result.grossWage).toBe(8000);
    expect(result.employeeContribution).toBe(1600);
    expect(result.totalContribution).toBe(2960);
  });

  it("should return zero for zero wage", () => {
    const result = calculateCPF(0, 0, 30);
    expect(result.employeeContribution).toBe(0);
    expect(result.employerContribution).toBe(0);
    expect(result.totalContribution).toBe(0);
    expect(result.grossWage).toBe(0);
  });

  it("should round employee contribution DOWN (floor)", () => {
    // $3333 OW, age 30: Employee = 3333 * 20% = 666.6 → floor to 666
    // Total = 3333 * 37% = 1233.21 → round half-up to 1233
    // Employer = 1233 - 666 = 567
    const result = calculateCPF(3333, 0, 30);
    expect(result.employeeContribution).toBe(666);
    expect(result.totalContribution).toBe(1233);
    expect(result.employerContribution).toBe(567);
  });

  it("should round total contribution with ROUND_HALF_UP", () => {
    // Find a wage where total has .5 fraction to test half-up
    // $5405 OW, age 30: Total = 5405 * 37% = 1999.85 → round to 2000
    // Employee = 5405 * 20% = 1081 (exact), Employer = 2000 - 1081 = 919
    const result = calculateCPF(5405, 0, 30);
    expect(result.totalContribution).toBe(2000);
    expect(result.employeeContribution).toBe(1081);
    expect(result.employerContribution).toBe(919);
  });

  it("should calculate correctly for age 56-60 tier", () => {
    // $5000 OW, age 58: rates 18%/16%, total 34%
    // Total = 5000 * 34% = 1700, Employee = 5000 * 18% = 900, Employer = 800
    const result = calculateCPF(5000, 0, 58);
    expect(result.employeeContribution).toBe(900);
    expect(result.employerContribution).toBe(800);
    expect(result.totalContribution).toBe(1700);
  });

  it("should calculate correctly for age 61-65 tier", () => {
    // $5000 OW, age 63: rates 12.5%/12.5%, total 25%
    // Total = 5000 * 25% = 1250, Employee = 5000 * 12.5% = 625, Employer = 625
    const result = calculateCPF(5000, 0, 63);
    expect(result.employeeContribution).toBe(625);
    expect(result.employerContribution).toBe(625);
    expect(result.totalContribution).toBe(1250);
  });

  it("should calculate correctly for age 66-70 tier", () => {
    // $5000 OW, age 68: rates 7.5%/9%, total 16.5%
    // Total = 5000 * 16.5% = 825, Employee = 5000 * 7.5% = 375, Employer = 450
    const result = calculateCPF(5000, 0, 68);
    expect(result.employeeContribution).toBe(375);
    expect(result.employerContribution).toBe(450);
    expect(result.totalContribution).toBe(825);
  });

  it("should calculate correctly for age > 70 tier", () => {
    // $5000 OW, age 75: rates 5%/7.5%, total 12.5%
    // Total = 5000 * 12.5% = 625, Employee = 5000 * 5% = 250, Employer = 375
    const result = calculateCPF(5000, 0, 75);
    expect(result.employeeContribution).toBe(250);
    expect(result.employerContribution).toBe(375);
    expect(result.totalContribution).toBe(625);
  });

  it("should enforce OW ceiling AND include AW simultaneously", () => {
    // $10000 OW (capped to $8000) + $3000 AW, age 30, no YTD
    // AW ceiling = 102000 - 0 - 8000 = 94000, capped AW = 3000
    // Total wage = 11000, Total = 11000 * 37% = 4070, Employee = 11000 * 20% = 2200
    const result = calculateCPF(10000, 3000, 30);
    expect(result.grossWage).toBe(11000);
    expect(result.employeeContribution).toBe(2200);
    expect(result.totalContribution).toBe(4070);
  });
});

// ---- calculatePayroll ----

describe("calculatePayroll — full payroll breakdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate basic payroll with default tax rate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026

    // Age 36 (born 1990-03-10), basic $4000, allowances $500
    // OW = 4500, AW = 0, gross = 4500
    // CPF: Total = 4500 * 37% = 1665, Employee = 4500 * 20% = 900
    // Income tax: 4500 * 15% = 675
    // Total deductions: 900 + 675 + 0 = 1575
    // Net: 4500 - 1575 = 2925
    const result = calculatePayroll(4000, 500, new Date(1990, 2, 10));

    expect(result.basicSalary).toBe(4000);
    expect(result.allowances).toBe(500);
    expect(result.overtime).toBe(0);
    expect(result.bonus).toBe(0);
    expect(result.grossSalary).toBe(4500);
    expect(result.cpfEmployee).toBe(900);
    expect(result.incomeTax).toBe(675);
    expect(result.otherDeductions).toBe(0);
    expect(result.totalDeductions).toBe(1575);
    expect(result.netSalary).toBe(2925);
  });

  it("should include overtime and bonus as additional wage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));

    // Age 36, basic $4000, allowances $500, overtime $300, bonus $1000
    // OW = 4500, AW = 1300, gross = 5800
    // CPF on total (4500 + 1300 = 5800): Total = 5800 * 37% = 2146, Employee = 5800 * 20% = 1160
    const result = calculatePayroll(4000, 500, new Date(1990, 2, 10), 300, 1000);

    expect(result.grossSalary).toBe(5800);
    expect(result.overtime).toBe(300);
    expect(result.bonus).toBe(1000);
    expect(result.cpfEmployee).toBe(1160);
  });

  it("should apply other deductions to net salary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));

    const result = calculatePayroll(4000, 500, new Date(1990, 2, 10), 0, 0, 200);

    expect(result.otherDeductions).toBe(200);
    // Net = gross - (cpfEmployee + incomeTax + otherDeductions)
    expect(result.netSalary).toBe(
      result.grossSalary - result.cpfEmployee - result.incomeTax - result.otherDeductions
    );
  });

  it("should use custom income tax rate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));

    // Tax rate = 10% on $4500 gross = $450
    const result = calculatePayroll(4000, 500, new Date(1990, 2, 10), 0, 0, 0, 0.10);

    expect(result.incomeTax).toBe(450);
  });

  it("should correctly compute net salary (gross - all deductions)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));

    const result = calculatePayroll(5000, 1000, new Date(1990, 2, 10), 500, 2000, 100, 0.10);

    const expectedNet =
      result.grossSalary - result.cpfEmployee - result.incomeTax - result.otherDeductions;
    expect(result.netSalary).toBe(expectedNet);
    expect(result.totalDeductions).toBe(result.cpfEmployee + result.incomeTax + result.otherDeductions);
  });

  it("should use correct CPF tier for an older employee", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 2026

    // Born Dec 1960 → age 65, rates 12.5%/12.5%
    // OW = 5000, Total = 5000 * 25% = 1250, Employee = 5000 * 12.5% = 625
    const result = calculatePayroll(4500, 500, new Date(1960, 11, 1));

    expect(result.cpfEmployee).toBe(625);
    expect(result.cpfEmployer).toBe(625);
  });
});
