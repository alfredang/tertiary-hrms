import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils";
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

export const dynamic = 'force-dynamic';

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

async function getEmployee(id: string) {
  const currentYear = new Date().getFullYear();

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      salaryInfo: true,
      leaveBalances: {
        where: { year: currentYear },
        include: { leaveType: true },
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

  const [employee, departments] = await Promise.all([
    getEmployee(id),
    getDepartments(),
  ]);

  if (!employee) {
    notFound();
  }

  // Determine if user can edit (ADMIN, HR, or MANAGER)
  const canEdit =
    session?.user &&
    ["ADMIN", "HR", "MANAGER"].includes(session.user.role);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20 bg-primary">
              <AvatarFallback className="bg-primary text-white text-2xl">
                {getInitials(`${employee.firstName} ${employee.lastName}`)}
              </AvatarFallback>
            </Avatar>
            {employee.status === "ACTIVE" && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">
              {employee.firstName} {employee.lastName}
            </h1>
            <p className="text-gray-400 mt-1">{employee.position}</p>
            <div className="flex items-center gap-2 mt-2">
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
                <p className="font-medium text-white">{format(new Date(employee.dateOfBirth), "PPP")}</p>
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
                <p className="font-medium text-white">{employee.department.name}</p>
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
                <p className="font-medium">{format(new Date(employee.startDate), "PPP")}</p>
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
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="h-5 w-5" />
              Leave Balance ({new Date().getFullYear()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {employee.leaveBalances.map((balance) => {
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
                          <span className="text-gray-300 font-medium">Balance:</span>
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
      )}
    </div>
  );
}
