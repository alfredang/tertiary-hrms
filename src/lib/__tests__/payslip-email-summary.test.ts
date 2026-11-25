import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/send-email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/payslip-drive", () => ({ buildPayslipPdfBuffer: vi.fn(), payslipFileName: vi.fn() }));
vi.mock("@/lib/company-settings", () => ({ getCompanyBranding: vi.fn() }));

import { payslipSummaryHtml } from "@/lib/payslip-email";

const base = { gross: 1045.45, cpfEmployee: 0, cpfEmployer: 0, takeHome: 818.18, unpaidLeaveDays: 5, unpaidLeaveDeduction: 227.27, paybackDays: 1, paybackAmount: 45.45 };

describe("payslipSummaryHtml", () => {
  it("shows an intern's MC / No Pay Leave, payback and no CPF", () => {
    const html = payslipSummaryHtml({ ...base, intern: true });
    expect(html).toContain("Payback added back (1 day worked)");
    expect(html).toContain("MC / No Pay Leave (5 days)");
    expect(html).toContain("None (interns have no CPF)");
    expect(html).not.toContain("CPF (employee)");
    expect(html).toContain("Take-home pay");
  });

  it("shows staff the CPF breakdown and no lines for nothing", () => {
    const html = payslipSummaryHtml({ intern: false, gross: 2200, cpfEmployee: 440, cpfEmployer: 374, takeHome: 1760, unpaidLeaveDays: 0, unpaidLeaveDeduction: 0, paybackDays: 0, paybackAmount: 0 });
    expect(html).toContain("CPF (employee)");
    expect(html).toContain("CPF (employer, paid by the company)");
    expect(html).not.toContain("No Pay Leave");
    expect(html).not.toContain("Payback");
  });
});
