import { prisma } from "@/lib/prisma";
import { EmployeeList } from "@/components/staff/employee-list";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = 'force-dynamic';

async function getEmployees(viewAs: "admin" | "staff", currentEmployeeId?: string) {
  // If viewing as staff, only show own record
  if (viewAs === "staff" && currentEmployeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: currentEmployeeId },
      include: {
        department: true,
        user: true,
      },
    });
    return employee ? [employee] : [];
  }

  if (viewAs === "staff" && !currentEmployeeId) {
    return [];
  }

  // Admin view: show all employees
  const employees = await prisma.employee.findMany({
    include: {
      department: true,
      user: true,
    },
    orderBy: { name: "asc" },
  });

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

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewAs = isAdmin ? viewMode : "staff";

  const [employees, departments] = await Promise.all([
    getEmployees(viewAs, currentEmployeeId),
    getDepartments(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Employees</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">{employees.length} team member{employees.length !== 1 ? "s" : ""}</p>
      </div>

      <EmployeeList employees={employees} departments={departments} isAdmin={viewAs === "admin"} />
    </div>
  );
}
