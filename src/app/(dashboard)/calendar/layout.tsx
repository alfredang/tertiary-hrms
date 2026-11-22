import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

/**
 * Accountants and the Trainer Admin view have no calendar (no leave or MC; Alfred, 22 Nov 2026):
 * the real ACCOUNTANT role, an admin's accountant view and the Trainer Admin view are sent home.
 * Staff and interns see only their own leave, MC, No Pay Leave and time off plus the holidays;
 * only the admin view shows everyone (enforced in each calendar page).
 */
export default async function CalendarLayout({ children }: { children: React.ReactNode }) {
  const viewMode = await getViewMode();
  if (viewMode === "trainer" || viewMode === "accountant") redirect("/dashboard");
  if (!isDevAuthSkipped()) {
    const session = await auth();
    const role = session?.user?.role;
    const roles = session?.user?.roles ?? [];
    if (!(role && hasAdminAccess(role)) && roles.includes("ACCOUNTANT")) redirect("/dashboard");
  }
  return <>{children}</>;
}
