/**
 * Who may sign in with which email (Alfred, 22 Nov 2026): staff sign in only with their company
 * address on tertiaryinfotech.com. Part-time staff (employment type PART_TIME) and interns may use
 * a personal address. Applies to every sign-in path — password, email code, Google on the web,
 * Google in the phone apps — and ends an open session at its next refresh.
 *
 * GUARDRAIL: keep every sign-in path calling `isLoginEmailAllowed` (src/lib/auth.ts authorize x2,
 * signIn and jwt callbacks; src/app/api/auth/google-mobile; src/app/api/auth/send-otp).
 * `.claude/hooks/hrms_guard.py` checks those call sites on every edit and before every push.
 */
export const COMPANY_EMAIL_DOMAIN = "tertiaryinfotech.com";

/** Employment types that may sign in with a personal email. */
export const PERSONAL_EMAIL_TYPES = ["PART_TIME", "INTERN"] as const;

export const COMPANY_EMAIL_REQUIRED_MESSAGE =
  `Please sign in with your company email (@${COMPANY_EMAIL_DOMAIN}). Personal email is only for part-time staff and interns.`;

export function isCompanyEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.endsWith("@" + COMPANY_EMAIL_DOMAIN);
}

/**
 * `employmentType`: the signed-in person's Employee.employmentType (null when the account has no
 * employee record, which then needs a company address).
 */
export function isLoginEmailAllowed(email: string | null | undefined, employmentType: string | null | undefined): boolean {
  if (isCompanyEmail(email)) return true;
  return !!employmentType && (PERSONAL_EMAIL_TYPES as readonly string[]).includes(employmentType);
}
