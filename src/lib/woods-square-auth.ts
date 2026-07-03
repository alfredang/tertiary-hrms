import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";

/**
 * Server-only auth helpers for the Woods Square access flow. Kept out of
 * `woods-square.ts` (which is client-safe) because these import `auth`/`prisma`.
 *
 * Centralised so the dev-auth fallback email and the admin-role check live in one
 * place instead of being copy-pasted across each route/page (where they could drift).
 */

/** The account impersonated when dev auth is skipped (local preview without a session). */
export const DEV_ADMIN_EMAIL = "admin@tertiaryinfotech.com";

/** Resolve the signed-in user with their employee profile, or null if unauthenticated. */
export async function getCurrentUser() {
  const email = isDevAuthSkipped() ? DEV_ADMIN_EMAIL : (await auth())?.user?.email;
  if (!email) return null;
  return prisma.user.findUnique({ where: { email }, include: { employee: true } });
}

/** True if the user holds an admin-tier role (or dev auth is skipped locally). */
export function isAdminUser(user: { roles?: string[] | null } | null | undefined): boolean {
  return isDevAuthSkipped() || (user?.roles ?? []).some((r) => hasAdminAccess(r));
}
