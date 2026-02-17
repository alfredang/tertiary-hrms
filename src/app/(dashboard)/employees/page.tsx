import { prisma } from "@/lib/prisma";
import { EmployeeList } from "@/components/staff/employee-list";

export const dynamic = 'force-dynamic';

async function getEmployees() {
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
          <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 mt-1">{employees.length} team members</p>
        </div>
      </div>

      <EmployeeList employees={employees} departments={departments} />
    </div>
  );
}
