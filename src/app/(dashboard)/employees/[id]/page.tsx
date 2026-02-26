import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials, prorateLeave } from "@/lib/utils";
import { format } from "date-fns";
import {
  Building2,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  DollarSign,
  User,
  FileText,
} from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import { EmployeeEditSheet } from "@/components/employees/employee-edit-sheet";
import { getViewMode } from "@/lib/view-mode";

export const dynamic = 'force-dynamic';

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

async function getEmployee(id: string) {
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      salaryInfo: true,
      leaveBalances: {
        where: {
          OR: [
            { year: currentYear },
            { year: lastYear },
          ],
        },
        include: { leaveType: true },
        orderBy: { year: "desc" },
      },
      leaveRequests: {
        include: {
          leaveType: true,
          approver: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return employee;
}

async function getDepartments() {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
  });
  return departments;
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  // Development mode: Skip authentication if SKIP_AUTH is enabled
  if (process.env.SKIP_AUTH !== "true") {
    if (!session?.user) {
      redirect("/login");
    }

    // Staff users can only view their own employee profile
    if (session.user.role === "STAFF" && session.user.employeeId !== id) {
      redirect("/employees");
    }
  }

  const viewMode = await getViewMode();

  const [employee, departments] = await Promise.all([
    getEmployee(id),
    getDepartments(),
  ]);

  if (!employee) {
    notFound();
  }

  // Determine role
  const role = process.env.SKIP_AUTH === "true" ? "ADMIN" : (session?.user?.role || "STAFF");
  const isAdmin = role === "ADMIN";

  // Only ADMIN can edit, and respect the view toggle
  const canEdit = isAdmin && viewMode === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 bg-primary">
              <AvatarFallback className="bg-primary text-white text-xl sm:text-2xl">
                {getInitials(employee.name)}
              </AvatarFallback>
            </Avatar>
            {employee.status === "ACTIVE" && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {employee.name}
            </h1>
            <p className="text-gray-400 mt-1">{employee.position}</p>
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mt-2">
              <Badge className={statusColors[employee.status]}>
                {statusLabels[employee.status]}
              </Badge>
              <span className="text-sm text-gray-400">ID: {employee.employeeId}</span>
            </div>
          </div>
        </div>

        {/* Edit Button - Only visible to ADMIN, HR, MANAGER */}
        {canEdit && (
          <EmployeeEditSheet employee={employee} departments={departments} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Information */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-400">Email</p>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="h-4 w-4 text-gray-400" />
                <p className="font-medium text-white">{employee.email}</p>
              </div>
            </div>
            {employee.phone && (
              <div>
                <p className="text-sm text-gray-400">Phone</p>
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <p className="font-medium text-white">{employee.phone}</p>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-400">Date of Birth</p>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="h-4 w-4 text-gray-400" />
                <p className="font-medium text-white">{employee.dateOfBirth ? format(new Date(employee.dateOfBirth), "PPP") : "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400">Gender</p>
              <p className="font-medium text-white mt-1">{employee.gender}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Residency Status</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={
                    employee.nationality === "Singaporean"
                      ? "border-green-500 text-green-400 bg-green-950/30"
                      : employee.nationality === "PR" || employee.nationality === "Permanent Resident"
                      ? "border-blue-500 text-blue-400 bg-blue-950/30"
                      : "border-amber-500 text-amber-400 bg-amber-950/30"
                  }
                >
                  {employee.nationality}
                </Badge>
              </div>
            </div>
            {employee.educationLevel && (
              <div>
                <p className="text-sm text-gray-400">Education Level</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={
                      employee.educationLevel === "PHD"
                        ? "border-purple-500 text-purple-400 bg-purple-950/30"
                        : employee.educationLevel === "MASTER"
                        ? "border-blue-500 text-blue-400 bg-blue-950/30"
                        : employee.educationLevel === "DEGREE"
                        ? "border-green-500 text-green-400 bg-green-950/30"
                        : "border-gray-500 text-gray-400 bg-gray-950/30"
                    }
                  >
                    {employee.educationLevel === "PHD" ? "PhD" : employee.educationLevel.charAt(0) + employee.educationLevel.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </div>
            )}
            {employee.nric && (
              <div>
                <p className="text-sm text-gray-400">NRIC</p>
                <div className="flex items-center gap-2 mt-1">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <p className="font-medium text-white">{employee.nric}</p>
                </div>
              </div>
            )}
            {employee.address && (
              <div>
                <p className="text-sm text-gray-400">Address</p>
                <div className="flex items-center gap-2 mt-1">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <p className="font-medium text-white">{employee.address}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-400">Department</p>
              <div className="flex items-center gap-2 mt-1">
                <Building2 className="h-4 w-4 text-gray-400" />
                <p className="font-medium text-white">{employee.department?.name ?? "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400">Position</p>
              <p className="font-medium text-white mt-1">{employee.position}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Employment Type</p>
              <p className="font-medium text-white mt-1">{employee.employmentType.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Start Date</p>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="h-4 w-4 text-gray-400" />
                <p className="font-medium">{employee.startDate ? format(new Date(employee.startDate), "PPP") : "—"}</p>
              </div>
            </div>
            {employee.endDate && (
              <div>
                <p className="text-sm text-gray-400">End Date</p>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <p className="font-medium text-white">{format(new Date(employee.endDate), "PPP")}</p>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-400">Status</p>
              <Badge className={`${statusColors[employee.status]} mt-1`}>
                {statusLabels[employee.status]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Compensation */}
        {employee.salaryInfo && (
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <DollarSign className="h-5 w-5" />
                Compensation & CPF
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-400">Basic Salary (Monthly)</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${Number(employee.salaryInfo.basicSalary).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              {Number(employee.salaryInfo.allowances) > 0 && (
                <div>
                  <p className="text-sm text-gray-400">Allowances (Monthly)</p>
                  <p className="text-lg font-medium text-gray-300">
                    ${Number(employee.salaryInfo.allowances).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}
              <div className="pt-2 border-t border-gray-800">
                <p className="text-sm text-gray-400">Gross Salary (Monthly)</p>
                <p className="text-xl font-bold text-white mt-1">
                  ${(Number(employee.salaryInfo.basicSalary) + Number(employee.salaryInfo.allowances)).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              {employee.salaryInfo.payNow && (
                <div>
                  <p className="text-sm text-gray-400">PayNow</p>
                  <p className="font-medium text-white mt-1">{employee.salaryInfo.payNow}</p>
                </div>
              )}
              {employee.salaryInfo.cpfApplicable && (
                <>
                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-sm font-medium text-gray-300 mb-2">CPF Contributions</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">
                          Employee ({Number(employee.salaryInfo.cpfEmployeeRate)}%)
                        </span>
                        <span className="text-orange-400 font-medium">
                          -${((Number(employee.salaryInfo.basicSalary) * Number(employee.salaryInfo.cpfEmployeeRate)) / 100).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">
                          Employer ({Number(employee.salaryInfo.cpfEmployerRate)}%)
                        </span>
                        <span className="text-blue-400 font-medium">
                          +${((Number(employee.salaryInfo.basicSalary) * Number(employee.salaryInfo.cpfEmployerRate)) / 100).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-sm text-gray-400">Take Home Pay</p>
                    <p className="text-2xl font-bold text-green-400 mt-1">
                      ${((Number(employee.salaryInfo.basicSalary) + Number(employee.salaryInfo.allowances)) - ((Number(employee.salaryInfo.basicSalary) * Number(employee.salaryInfo.cpfEmployeeRate)) / 100)).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Leave Information */}
      {employee.leaveBalances && employee.leaveBalances.length > 0 && (
        <div className="space-y-6">
          {/* Current Year Leave Balance */}
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Calendar className="h-5 w-5" />
                Leave Balance - {new Date().getFullYear()} (Current Year)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {employee.leaveBalances
                  .filter((balance) => balance.year === new Date().getFullYear())
                  .map((balance) => {
                    const fullEntitlement = Number(balance.entitlement);
                    // AL is prorated based on employee start date; others use full entitlement
                    const isAL = balance.leaveType.code === "AL";
                    const allocation = isAL
                      ? prorateLeave(fullEntitlement, employee.startDate ?? undefined)
                      : fullEntitlement;
                    const totalBalance = allocation + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending);
                    return (
                      <div key={balance.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-white">{balance.leaveType.name}</p>
                          <Badge variant="outline" className="text-gray-400 border-gray-700">
                            {balance.leaveType.code}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Entitlement:</span>
                            <span className="text-white font-medium">
                              {fullEntitlement} days
                            </span>
                          </div>
                          {isAL && allocation !== fullEntitlement && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Allocation:</span>
                              <span className="text-cyan-400 font-medium">
                                {allocation} days <span className="text-gray-500 text-xs">(prorated)</span>
                              </span>
                            </div>
                          )}
                          {Number(balance.carriedOver) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Carried Over:</span>
                              <span className="text-blue-400 font-medium">+{Number(balance.carriedOver)} days</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-400">Used:</span>
                            <span className="text-orange-400 font-medium">{Number(balance.used)} days</span>
                          </div>
                          {Number(balance.pending) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Pending:</span>
                              <span className="text-amber-400 font-medium">{Number(balance.pending)} days</span>
                            </div>
                          )}
                          <div className="pt-2 border-t border-gray-800">
                            <div className="flex justify-between">
                              <span className="text-gray-300 font-medium">Remaining:</span>
                              <span className={`font-bold ${totalBalance > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {totalBalance} days
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Last Year Leave Balance */}
          {employee.leaveBalances.some((b) => b.year === new Date().getFullYear() - 1) && (
            <Card className="bg-gray-950 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Calendar className="h-5 w-5" />
                  Leave Balance - {new Date().getFullYear() - 1} (Last Year)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {employee.leaveBalances
                    .filter((balance) => balance.year === new Date().getFullYear() - 1)
                    .map((balance) => {
                      const totalBalance = Number(balance.entitlement) + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending);
                      return (
                        <div key={balance.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-white">{balance.leaveType.name}</p>
                            <Badge variant="outline" className="text-gray-400 border-gray-700">
                              {balance.leaveType.code}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Entitlement:</span>
                              <span className="text-white font-medium">{Number(balance.entitlement)} days</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Used:</span>
                              <span className="text-orange-400 font-medium">{Number(balance.used)} days</span>
                            </div>
                            <div className="pt-2 border-t border-gray-800">
                              <div className="flex justify-between">
                                <span className="text-gray-300 font-medium">Final Balance:</span>
                                <span className={`font-bold ${totalBalance > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                                  {totalBalance} days
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leave History */}
          {employee.leaveRequests && employee.leaveRequests.length > 0 && (
            <Card className="bg-gray-950 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <FileText className="h-5 w-5" />
                  Leave History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">Leave Type</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">Start Date</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">End Date</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">Days</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">Status</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">Approver</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-medium text-gray-400">Applied On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employee.leaveRequests.map((request) => (
                        <tr key={request.id} className="border-b border-gray-800">
                          <td className="py-3 px-2 sm:px-4 text-sm text-white">{request.leaveType.name}</td>
                          <td className="py-3 px-2 sm:px-4 text-sm text-gray-400">
                            {format(new Date(request.startDate), "dd MMM yyyy")}
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-sm text-gray-400">
                            {format(new Date(request.endDate), "dd MMM yyyy")}
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-sm text-white font-medium">
                            {Number(request.days)}
                          </td>
                          <td className="py-3 px-2 sm:px-4">
                            <Badge
                              className={
                                request.status === "APPROVED"
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : request.status === "REJECTED"
                                  ? "bg-red-100 text-red-800 border-red-200"
                                  : request.status === "CANCELLED"
                                  ? "bg-gray-100 text-gray-800 border-gray-200"
                                  : "bg-amber-100 text-amber-800 border-amber-200"
                              }
                            >
                              {request.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-sm text-gray-400">
                            {request.approver
                              ? request.approver.name
                              : "-"}
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-sm text-gray-400">
                            {format(new Date(request.createdAt), "dd MMM yyyy")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
