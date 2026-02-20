"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Grid3X3, List, Plus, Building2, Mail, Phone } from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { Employee, Department, EmployeeStatus, User, Role } from "@prisma/client";

interface EmployeeListProps {
  employees: (Employee & { department: Department; user: User })[];
  departments: Department[];
  isAdmin?: boolean;
}

const statusColors: Record<EmployeeStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  ON_LEAVE: "bg-amber-100 text-amber-800 border-amber-200",
  TERMINATED: "bg-red-100 text-red-800 border-red-200",
  RESIGNED: "bg-gray-100 text-gray-800 border-gray-200",
};

const statusLabels: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On Leave",
  TERMINATED: "Terminated",
  RESIGNED: "Resigned",
};

const roleColors: Record<Role, string> = {
  ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
  HR: "bg-blue-100 text-blue-800 border-blue-200",
  MANAGER: "bg-indigo-100 text-indigo-800 border-indigo-200",
  STAFF: "bg-gray-100 text-gray-800 border-gray-200",
};

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  HR: "HR",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export function EmployeeList({ employees, departments, isAdmin = true }: EmployeeListProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.name
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      employee.email.toLowerCase().includes(search.toLowerCase()) ||
      employee.position.toLowerCase().includes(search.toLowerCase());

    const matchesDepartment =
      departmentFilter === "all" || employee.departmentId === departmentFilter;

    const matchesStatus =
      statusFilter === "all" || employee.status === statusFilter;

    return matchesSearch && matchesDepartment && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters - only show for admin view */}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-1 gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                <SelectItem value="RESIGNED">Resigned</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg p-1">
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
            <Link href="/employees/new">
              <Button>
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
              <Card className="hover:border-primary/50 transition-colors cursor-pointer bg-gray-950 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12 bg-primary">
                        <AvatarFallback className="bg-primary text-white">
                          {getInitials(employee.name)}
                        </AvatarFallback>
                      </Avatar>
                      {employee.status === "ACTIVE" && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white mb-2 break-words">
                        {employee.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusColors[employee.status]}>
                          {statusLabels[employee.status]}
                        </Badge>
                        <Badge className={roleColors[employee.user.role]}>
                          {roleLabels[employee.user.role]}
                        </Badge>
                        <Badge variant="outline" className="border-gray-600 text-gray-300">
                          {employee.position}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 flex-shrink-0" />
                      <span>{employee.department.name}</span>
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
        <Card className="bg-gray-950 border-gray-800">
          <div className="divide-y divide-gray-800">
            {filteredEmployees.map((employee) => (
              <Link key={employee.id} href={`/employees/${employee.id}`}>
                <div className="flex items-center gap-4 p-4 hover:bg-gray-900 transition-colors cursor-pointer">
                  <Avatar className="h-10 w-10 bg-primary">
                    <AvatarFallback className="bg-primary text-white text-sm">
                      {getInitials(employee.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white mb-1">
                      {employee.name}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusColors[employee.status]}>
                        {statusLabels[employee.status]}
                      </Badge>
                      <Badge className={roleColors[employee.user.role]}>
                        {roleLabels[employee.user.role]}
                      </Badge>
                      <Badge variant="outline" className="border-gray-600 text-gray-300">
                        {employee.position}
                      </Badge>
                    </div>
                  </div>
                  <div className="hidden sm:block text-sm text-gray-400">
                    {employee.department.name}
                  </div>
                  <div className="hidden md:block text-sm text-gray-400">
                    {employee.email}
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
