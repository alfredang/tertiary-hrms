import Decimal from "decimal.js";

interface CPFRates {
  employee: Decimal;
  employer: Decimal;
}

interface CPFResult {
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
  grossWage: number;
}

// Monthly Ordinary Wage ceiling
const OW_CEILING = new Decimal(8000);

// Annual wage ceiling for 2026
const ANNUAL_CEILING = new Decimal(102000);

/**
 * Get CPF contribution rates based on employee age
 * Source: CPF Board Singapore 2026 rates
 */
export function getCPFRates(age: number): CPFRates {
  if (age <= 55) {
    return { employee: new Decimal(20), employer: new Decimal(17) };
  } else if (age <= 60) {
    return { employee: new Decimal(18), employer: new Decimal(16) };
  } else if (age <= 65) {
    return { employee: new Decimal(12.5), employer: new Decimal(12.5) };
  } else if (age <= 70) {
    return { employee: new Decimal(7.5), employer: new Decimal(9) };
  } else {
    return { employee: new Decimal(5), employer: new Decimal(7.5) };
  }
}

/**
 * Calculate age from date of birth
 */
export function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Calculate CPF contributions for an employee
 *
 * @param ordinaryWage - Monthly basic salary + allowances
 * @param additionalWage - Bonus, commission, etc. (optional)
 * @param age - Employee's age
 * @param ytdOrdinaryWage - Year-to-date ordinary wage already contributed (for ceiling calculation)
 */
export function calculateCPF(
  ordinaryWage: number,
  additionalWage: number = 0,
  age: number,
  ytdOrdinaryWage: number = 0
): CPFResult {
  const rates = getCPFRates(age);

  // Cap ordinary wage at monthly ceiling
  const owDecimal = new Decimal(ordinaryWage);
  const cappedOW = Decimal.min(owDecimal, OW_CEILING);

  // Calculate remaining AW ceiling
  const ytdOW = new Decimal(ytdOrdinaryWage);
  const awCeiling = Decimal.max(
    ANNUAL_CEILING.minus(ytdOW).minus(cappedOW),
    new Decimal(0)
  );
  const awDecimal = new Decimal(additionalWage);
  const cappedAW = Decimal.min(awDecimal, awCeiling);

  const totalWage = cappedOW.plus(cappedAW);

  // Calculate total contribution first (rounded to nearest dollar)
  const totalContributionRate = rates.employee.plus(rates.employer);
  const totalContribution = totalWage
    .times(totalContributionRate)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  // Employee contribution (rounded down)
  const employeeContribution = totalWage
    .times(rates.employee)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_DOWN);

  // Employer contribution = Total - Employee
  const employerContribution = totalContribution.minus(employeeContribution);

  return {
    employeeContribution: employeeContribution.toNumber(),
    employerContribution: employerContribution.toNumber(),
    totalContribution: totalContribution.toNumber(),
    grossWage: totalWage.toNumber(),
  };
}

/**
 * Calculate full payroll breakdown
 */
export function calculatePayroll(
  basicSalary: number,
  allowances: number,
  dateOfBirth: Date,
  overtime: number = 0,
  bonus: number = 0,
  otherDeductions: number = 0,
  incomeTaxRate: number = 0.15 // Default 15% income tax
): {
  basicSalary: number;
  allowances: number;
  overtime: number;
  bonus: number;
  grossSalary: number;
  cpfEmployee: number;
  cpfEmployer: number;
  incomeTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
} {
  const age = calculateAge(dateOfBirth);
  const ordinaryWage = basicSalary + allowances;
  const additionalWage = overtime + bonus;
  const grossSalary = ordinaryWage + additionalWage;

  const cpf = calculateCPF(ordinaryWage, additionalWage, age);

  // Calculate income tax (simplified - actual Singapore tax is progressive)
  const incomeTax = Math.round(grossSalary * incomeTaxRate);

  const totalDeductions = cpf.employeeContribution + incomeTax + otherDeductions;
  const netSalary = grossSalary - totalDeductions;

  return {
    basicSalary,
    allowances,
    overtime,
    bonus,
    grossSalary,
    cpfEmployee: cpf.employeeContribution,
    cpfEmployer: cpf.employerContribution,
    incomeTax,
    otherDeductions,
    totalDeductions,
    netSalary,
  };
}
