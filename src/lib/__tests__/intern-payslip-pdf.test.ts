import { describe, it, expect } from "vitest";
import { generatePayslipPDF } from "@/lib/pdf-generator";

// Interns have no CPF: their payslip says "Allowance", never "Gross" (Alfred, 26 Nov 2026).
function pdfText(intern: boolean): string {
  const buf = generatePayslipPDF({
    company: { name: "Test Co", address: "1 Test Road" },
    employee: { name: "TEST INTERN", id: "I9999", department: "Dev", position: "Intern" },
    payPeriod: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
    paymentDate: new Date(2026, 9, 28),
    intern,
    earnings: { basicSalary: 0, allowances: 1000, overtime: 0, bonus: 0, paybackDays: 1, paybackAmount: 45.45, gross: 1000 },
    deductions: { cpfEmployee: 0, incomeTax: 0, other: 0, unpaidLeaveDays: 5, unpaidLeaveAmount: 227.45, total: 227.45 },
    cpf: { employee: 0, employer: 0, total: 0 },
    netSalary: 818,
    internPay: intern
      ? { workingDays: 22, nplDays: 1, nplDeduction: 45.45, mcDays: 4, mcDeduction: 181.82, paybackDays: 1, paybackAmount: 45.45, paidDays: 18, roundingDown: 0.18 }
      : undefined,
  });
  return Buffer.from(buf).toString("latin1");
}

describe("intern payslip PDF", () => {
  it("says Allowance and never Gross", () => {
    const text = pdfText(true);
    expect(text).toContain("Allowance");
    expect(text).toContain("x Allowance / working days");
    expect(text).not.toMatch(/Gross/i);
  });
  it("keeps Gross Salary on a staff payslip", () => {
    expect(pdfText(false)).toContain("Gross Salary");
  });
});
