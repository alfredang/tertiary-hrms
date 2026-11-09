import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";

export interface FinanceActor {
  allowed: boolean;
  /** NextAuth user id (User.id), null in SKIP_AUTH dev mode */
  userId: string | null;
  role: string;
  roles: string[];
}

/**
 * Admin/accountant gate for the accounting module, per CLAUDE.md:
 * `hasAdminAccess(role) || roles.includes("ACCOUNTANT")`. Use it in both pages and API routes.
 */
export async function getFinanceActor(): Promise<FinanceActor> {
  if (isDevAuthSkipped()) return { allowed: true, userId: null, role: "ADMIN", roles: ["ADMIN"] };
  const session = await auth();
  if (!session?.user) return { allowed: false, userId: null, role: "", roles: [] };
  const role = ((session.user as any).role as string | undefined) ?? "STAFF";
  const roles = ((session.user as any).roles as string[] | undefined) ?? [role];
  return {
    allowed: hasAdminAccess(role) || roles.includes("ACCOUNTANT"),
    userId: (session.user as any).id ?? null,
    role,
    roles,
  };
}
