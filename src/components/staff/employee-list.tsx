"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Pencil } from "lucide-react";
import type { Employee, Department, EmployeeStatus, User, Role } from "@prisma/client";

interface EmployeeListProps {
  employees: (Employee & { department: Department | null; user: User })[];
  departments: Department[];
  isAdmin?: boolean;
}

const statusColors: Record<EmployeeStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  ON_LEAVE: "bg-amber-100 text-amber-800 border-amber-200",
  TERMINATED: "bg-red-100 text-red-800 border-red-200",
  RESIGNED: "bg-gray-100 text-gray-800 border-gray-200",
  INACTIVE: "bg-slate-100 text-slate-800 border-slate-200",
};

const statusLabels: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On Leave",
  TERMINATED: "Terminated",
  RESIGNED: "Resigned",
  INACTIVE: "Inactive",
};

const roleColors: Record<Role, string> = {
  ADMIN:      "bg-purple-100 text-purple-800 border-purple-200",
  HR:         "bg-blue-100 text-blue-800 border-blue-200",
  MANAGER:    "bg-indigo-100 text-indigo-800 border-indigo-200",
  ACCOUNTANT: "bg-sky-100 text-sky-800 border-sky-200",
  STAFF:      "bg-gray-100 text-gray-800 border-gray-200",
  INTERN:     "bg-amber-100 text-amber-800 border-amber-200",
};

const rolePriority: Record<Role, number> = {
  ADMIN: 0,
  STAFF: 1,
  ACCOUNTANT: 2,
  INTERN: 3,
  HR: 4,
  MANAGER: 5,
};

const roleLabels: Record<Role, string> = {
  ADMIN:      "Admin",
  HR:         "HR",
  MANAGER:    "Manager",
  ACCOUNTANT: "Accountant",
  STAFF:      "Staff",
  INTERN:     "Intern",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_SIZE = 20;

export function EmployeeList({ employees, departments, isAdmin = true }: EmployeeListProps) {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [page, setPage] = useState(1);

  // Reset to first page whenever filters/search change
  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter, statusFilter]);

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.name
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      employee.email.toLowerCase().includes(search.toLowerCase()) ||
      (employee.position ?? "").toLowerCase().includes(search.toLowerCase());

    const matchesDepartment =
      departmentFilter === "all" || employee.departmentId === departmentFilter;

    const matchesStatus =
      statusFilter === "all" || employee.status === statusFilter;

    return matchesSearch && matchesDepartment && matchesStatus;
  }).sort((a, b) => a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }));

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedEmployees = filteredEmployees.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters - only show for admin view */}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row flex-1 gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-3">
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  <SelectItem value="RESIGNED">Resigned</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <Link href="/employees/new" className="flex-1 sm:flex-none">
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Create Staff
              </Button>
            </Link>
            <Link href="/employees/new-intern" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Create Intern
              </Button>
            </Link>
          </div>
        </div>
      )}

      <Card className="bg-gray-950 border-gray-800 overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-800">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Employee ID</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Name</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Role</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Job Function</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Email</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Tel</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Start Date</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">End Date</th>
                <th className="px-3 py-2 font-medium w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paginatedEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="group hover:bg-gray-900 transition-colors cursor-pointer"
                  onClick={() => { window.location.href = `/employees/${employee.id}`; }}
                >
                  <td className="px-3 py-2 font-semibold text-gray-300 tracking-wide whitespace-nowrap">
                    {employee.employeeId}
                  </td>
                  <td className="px-3 py-2 font-medium text-white whitespace-nowrap">
                    {employee.name}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      {[...(employee.user.roles ?? [])].sort((a, b) => rolePriority[a] - rolePriority[b]).map((r) => (
                        <Badge key={r} className={roleColors[r]}>
                          {roleLabels[r]}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge className={statusColors[employee.status]}>
                      {statusLabels[employee.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {employee.department?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {employee.email.includes(".noemail@") ? "—" : employee.email}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {employee.phone ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {formatDate(employee.startDate)}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {formatDate(employee.endDate)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/employees/${employee.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

      {filteredEmployees.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No employees found</p>
        </div>
      )}

      {filteredEmployees.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-gray-400">
            Showing <span className="text-white">{pageStart + 1}</span>–
            <span className="text-white">{pageStart + paginatedEmployees.length}</span> of{" "}
            <span className="text-white">{filteredEmployees.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-400 px-2">
              Page <span className="text-white">{currentPage}</span> of{" "}
              <span className="text-white">{totalPages}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
