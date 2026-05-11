"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
import { Search, Grid3X3, List, Plus, Building2, Mail, Phone, Pencil } from "lucide-react";
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

export function EmployeeList({ employees, departments, isAdmin = true }: EmployeeListProps) {
  const [view, setView] = useState<"grid" | "list">("list");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
  }).sort((a, b) => {
    const aRank = Math.min(...(a.user.roles ?? []).map((r) => rolePriority[r]), 99);
    const bRank = Math.min(...(b.user.roles ?? []).map((r) => rolePriority[r]), 99);
    if (aRank !== bRank) return aRank - bRank;
    return a.employeeId.localeCompare(b.employeeId);
  });

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
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
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
            <div className="hidden sm:flex items-center border rounded-lg p-1">
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("grid")}
                className="h-8 w-8"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("list")}
                className="h-8 w-8"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Link href="/employees/new" className="flex-1 sm:flex-none">
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Employee Grid/List */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((employee) => (
            <Link key={employee.id} href={`/employees/${employee.id}`}>
              <Card className="group hover:border-primary/50 transition-colors cursor-pointer bg-gray-950 border-gray-800">
                <CardContent className="p-4 sm:p-6 relative">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="text-sm font-semibold text-gray-300 tracking-wide w-16 flex-shrink-0">
                      {employee.employeeId}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white mb-2 break-words">
                        {employee.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusColors[employee.status]}>
                          {statusLabels[employee.status]}
                        </Badge>
                        {(employee.user.roles ?? []).map((r) => (
                          <Badge key={r} className={roleColors[r]}>
                            {roleLabels[r]}
                          </Badge>
                        ))}
                        <Badge variant="outline" className="border-gray-600 text-gray-300">
                          {employee.position}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 flex-shrink-0" />
                      <span>{employee.department?.name ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="break-all">{employee.email}</span>
                    </div>
                    {employee.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        <span>{employee.phone}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="bg-gray-950 border-gray-800 overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-800">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Employee ID</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Name</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Type</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Role</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Email</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Tel</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Start Date</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">End Date</th>
                <th className="px-3 py-2 font-medium w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredEmployees.map((employee) => (
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
                      className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {filteredEmployees.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No employees found</p>
        </div>
      )}
    </div>
  );
}
