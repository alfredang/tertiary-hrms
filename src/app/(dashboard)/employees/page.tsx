import { prisma } from "@/lib/prisma";
import { EmployeeList } from "@/components/staff/employee-list";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { isInternRoles } from "@/lib/leave-policy";
import { latestPaySummaries } from "@/lib/pay-summary";

export const dynamic = 'force-dynamic';

async function getEmployees(viewAs: string, currentEmployeeId?: string) {
  // If viewing as staff/intern/accountant, only show own record
  if (viewAs !== "admin" && currentEmployeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: currentEmployeeId },
      include: {
        department: true,
        user: { select: { roles: true } },
      },
    });
    return employee ? [employee] : [];
  }

  if (viewAs !== "admin" && !currentEmployeeId) {
    return [];
  }

  // Admin view: every present and past staff member, sorted by employeeId (natural numeric order).
  // Interns have their own page, /interns (Alfred, 20 Nov 2026).
  const everyone = await prisma.employee.findMany({
    include: {
      department: true,
      user: { select: { roles: true } },
    },
  });
  const employees = everyone.filter((e) => !isInternRoles(e.user?.roles));

  employees.sort((a, b) =>
    a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }),
  );

  return employees;
}

async function getDepartments() {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
  });

  return departments;
}

export default async function EmployeesPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role = "STAFF";
  let currentEmployeeId: string | undefined;

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    currentEmployeeId = adminUser?.employee?.id;
  } else {
    if (!session?.user) {
      redirect("/login");
    }
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
  }

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";

  const [employees, departments] = await Promise.all([
    getEmployees(viewAs, currentEmployeeId),
    getDepartments(),
  ]);

  const active = employees.filter((e) => e.status === "ACTIVE" || e.status === "ON_LEAVE").length;
  // Pay figures are for the admin view only.
  const pay = viewAs === "admin" ? await latestPaySummaries(employees.map((e) => e.id)) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{viewAs === "admin" ? "Staff Management" : "Employees"}</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          {viewAs === "admin"
            ? `${active} active · ${employees.length - active} past`
            : `${employees.length} team member${employees.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <EmployeeList employees={employees} departments={departments} isAdmin={viewAs === "admin"} kind="staff" pay={pay} />
    </div>
  );
}
