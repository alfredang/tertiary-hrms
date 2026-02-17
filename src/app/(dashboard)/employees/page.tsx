import { prisma } from "@/lib/prisma";
import { EmployeeList } from "@/components/staff/employee-list";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

async function getEmployees() {
  const session = await auth();

  // Development mode: Skip authentication if SKIP_AUTH is enabled
  if (process.env.SKIP_AUTH !== "true") {
    if (!session?.user) {
      redirect("/login");
    }

    // Staff can only see their own employee record
    if (session.user.role === "STAFF") {
      if (!session.user.employeeId) {
        return [];
      }

      const employee = await prisma.employee.findUnique({
        where: { id: session.user.employeeId },
        include: {
          department: true,
        },
      });

      return employee ? [employee] : [];
    }
  }

  // Admin, HR, and Manager can see all employees
  const employees = await prisma.employee.findMany({
    include: {
      department: true,
    },
    orderBy: { firstName: "asc" },
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
  const [employees, departments] = await Promise.all([
    getEmployees(),
    getDepartments(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Employees</h1>
          <p className="text-gray-400 mt-1">{employees.length} team members</p>
        </div>
      </div>

      <EmployeeList employees={employees} departments={departments} />
    </div>
  );
}
