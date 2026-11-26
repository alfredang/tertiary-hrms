import { ELEVATED_ROLE_HOLDERS } from "@/lib/role-policy";

/**
 * PAY-EDIT GUARDRAIL (Alfred, 26 Nov 2026): only the admins may change salary or pay —
 * a salary or intern allowance, a payslip, or a payroll run (Excel upload, CPF statement,
 * auto-generate). The admins are exactly the people holding ADMIN in src/lib/role-policy.ts
 * (Alfred Ang and Tan Soik Ching); nobody else can be an admin.
 *
 * Enforced on the server by `requirePayEditor()` (src/lib/pay-edit-gate.ts) in every route that
 * writes SalaryInfo or Payslip, and by `.claude/hooks/hrms_guard.py`, which checks those routes
 * on every edit and before every push. The month-end run (cron) is the system, not a person.
 */
export const PAY_EDITOR_EMAILS: readonly string[] = Object.entries(ELEVATED_ROLE_HOLDERS)
  .filter(([, roles]) => roles.includes("ADMIN"))
  .map(([email]) => email);

/** True only for a signed-in ADMIN who is one of the named admins. */
export function canEditPay(user: { role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user || user.role !== "ADMIN") return false;
  return PAY_EDITOR_EMAILS.includes((user.email ?? "").trim().toLowerCase());
}

export const PAY_EDIT_REFUSAL = "Only the admins (Alfred Ang, Tan Soik Ching) can change salary or pay.";
