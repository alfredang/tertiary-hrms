import { prisma } from "@/lib/prisma";
import { EmployeeList } from "@/components/staff/employee-list";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { isInternRoles } from "@/lib/leave-policy";

export const dynamic = "force-dynamic";

/** Intern Management: every present and past intern (roles exactly INTERN). Admin view only. */
export default async function InternsPage() {
  if (!isDevAuthSkipped()) {
    const [session, viewMode] = await Promise.all([auth(), getViewMode()]);
    if (!session?.user) redirect("/login");
    if (!hasAdminAccess(session.user.role) || viewMode !== "admin") redirect("/employees");
  }

  const [everyone, departments] = await Promise.all([
    prisma.employee.findMany({ include: { department: true, user: { select: { roles: true } } } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const interns = everyone.filter((e) => isInternRoles(e.user?.roles));
  const active = interns.filter((e) => e.status === "ACTIVE" || e.status === "ON_LEAVE").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Intern Management</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">{active} active · {interns.length - active} past</p>
      </div>

      <EmployeeList employees={interns} departments={departments} isAdmin kind="intern" />
    </div>
  );
}
