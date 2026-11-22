import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

/** Accountants apply for no leave or MC (Alfred, 22 Nov 2026): the real role and the admin's accountant view are sent home. */
export default async function LeaveLayout({ children }: { children: React.ReactNode }) {
  if (!isDevAuthSkipped()) {
    const [session, viewMode] = await Promise.all([auth(), getViewMode()]);
    const role = session?.user?.role;
    const roles = session?.user?.roles ?? [];
    const isAdmin = !!role && hasAdminAccess(role);
    if (isAdmin ? viewMode === "accountant" : roles.includes("ACCOUNTANT")) redirect("/dashboard");
  } else if ((await getViewMode()) === "accountant") {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
