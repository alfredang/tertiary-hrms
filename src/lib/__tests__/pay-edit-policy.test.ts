import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { canEditPay, PAY_EDITOR_EMAILS } from "@/lib/pay-edit-policy";
import { ELEVATED_ROLE_HOLDERS } from "@/lib/role-policy";

// PAY-EDIT GUARDRAIL (Alfred, 26 Nov 2026): only the admins, Alfred Ang and Tan Soik Ching,
// may change salary or pay; nobody else can be an admin.
describe("pay-edit policy", () => {
  it("has exactly two admins: Alfred Ang and Tan Soik Ching", () => {
    const admins = Object.entries(ELEVATED_ROLE_HOLDERS).filter(([, r]) => r.includes("ADMIN")).map(([e]) => e).sort();
    expect(admins).toEqual(["angch@tertiaryinfotech.com", "tansc@tertiaryinfotech.com"]);
    expect([...PAY_EDITOR_EMAILS].sort()).toEqual(admins);
  });

  it("lets only the two admins, signed in as ADMIN, edit pay", () => {
    expect(canEditPay({ role: "ADMIN", email: "angch@tertiaryinfotech.com" })).toBe(true);
    expect(canEditPay({ role: "ADMIN", email: "TanSC@tertiaryinfotech.com" })).toBe(true);
    expect(canEditPay({ role: "ADMIN", email: "someone@tertiaryinfotech.com" })).toBe(false);
    expect(canEditPay({ role: "HR", email: "angch@tertiaryinfotech.com" })).toBe(false);
    expect(canEditPay({ role: "ACCOUNTANT", email: "jasminetertiary@gmail.com" })).toBe(false);
    expect(canEditPay({ role: "MANAGER", email: "x@tertiaryinfotech.com" })).toBe(false);
    expect(canEditPay({ role: "STAFF", email: "angch@tertiaryinfotech.com" })).toBe(false);
    expect(canEditPay(null)).toBe(false);
  });

  // Every route that writes SalaryInfo or Payslip must go through the gate.
  const GATED: Record<string, string> = {
    "src/app/api/payroll/payslip/[id]/route.ts": "requirePayEditor(",
    "src/app/api/payroll/upload/route.ts": "requirePayEditor(",
    "src/app/api/payroll/generate/route.ts": "requirePayEditor(",
    "src/app/api/payroll/cpf-submission/parse/route.ts": "requirePayEditor(",
    "src/app/api/payroll/cpf-submission/apply/route.ts": "requirePayEditor(",
    "src/app/api/employees/[id]/salary-info/route.ts": "requirePayEditor(",
    "src/app/api/employees/[id]/intern-allowance/route.ts": "requirePayEditor(",
    "src/app/api/employees/route.ts": "callerCanEditPay(",
    "src/app/api/employees/[id]/route.ts": "callerCanEditPay(",
  };
  for (const [rel, call] of Object.entries(GATED)) {
    it(`${rel} calls ${call.slice(0, -1)}`, () => {
      expect(readFileSync(join(process.cwd(), rel), "utf8")).toContain(call);
    });
  }
});
