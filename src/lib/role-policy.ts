import type { Role } from "@prisma/client";

/**
 * Who may hold an elevated role (Alfred, 22 Nov 2026). Everyone else is STAFF or INTERN only.
 *
 * GUARDRAIL, enforced three ways:
 *  1. Writes: POST /api/employees and PATCH /api/employees/{id} refuse a role not allowed here
 *     (`disallowedRoles`).
 *  2. Reads: every sign-in path and the session refresh keep only allowed roles (`effectiveRoles`),
 *     so a role written straight into the database grants nothing.
 *  3. `.claude/hooks/hrms_guard.py` checks those call sites on every edit and before every push.
 * To change who holds a role, change this list (and say why in the commit).
 */
export const ELEVATED_ROLES = ["ADMIN", "HR", "MANAGER", "ACCOUNTANT", "TRAINER_ADMIN"] as const;

export const ELEVATED_ROLE_HOLDERS: Record<string, readonly string[]> = {
  "angch@tertiaryinfotech.com": ELEVATED_ROLES, // Alfred Ang: every role (also previews them)
  "tansc@tertiaryinfotech.com": ["ADMIN", "TRAINER_ADMIN"], // Tan Soik Ching
  "jasminetertiary@gmail.com": ["ACCOUNTANT"], // Jasmine Sho, the accountant
  "deepa@tertiaryinfotech.com": ["TRAINER_ADMIN"], // Deepa Arumugam
};

const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/** Roles in `roles` that this person may not hold. */
export function disallowedRoles(email: string | null | undefined, roles: readonly string[]): string[] {
  const allowed = ELEVATED_ROLE_HOLDERS[norm(email)] ?? [];
  return roles.filter((r) => (ELEVATED_ROLES as readonly string[]).includes(r) && !allowed.includes(r));
}

/** The roles a session actually gets: the stored ones minus any not allowed; STAFF when none is left. */
export function effectiveRoles(email: string | null | undefined, roles: readonly Role[] | null | undefined): Role[] {
  const bad = new Set(disallowedRoles(email, roles ?? []));
  const kept = (roles ?? []).filter((r) => !bad.has(r));
  return kept.length > 0 ? kept : ["STAFF" as Role];
}

export function roleRefusalMessage(bad: string[]): string {
  return `Only named people may hold ${bad.join(", ")} (src/lib/role-policy.ts). Everyone else is Staff or Intern.`;
}
