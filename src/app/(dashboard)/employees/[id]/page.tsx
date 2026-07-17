import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prorateLeave, computeYearlyEntitlement } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar, DollarSign, FileText, Briefcase, Users } from "lucide-react";
import { EmployeeDetailEditable } from "@/components/employees/employee-detail-editable";
import { InternCompensationCard } from "@/components/employees/intern-compensation-card";
import { StaffCompensationCard } from "@/components/employees/staff-compensation-card";
import { ManagersCard } from "@/components/employees/managers-card";
import { AdminOtLogPanel } from "@/components/employees/admin-ot-log-panel";
import { LeaveBalanceEditDialog } from "@/components/employees/leave-balance-edit-dialog";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = 'force-dynamic';

async function getEmployee(id: string) {
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      user: { select: { roles: true } },
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
  if (!isDevAuthSkipped()) {
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

  // Manager candidates: all active non-intern employees except this one
  const candidateManagers = await prisma.employee.findMany({
    where: {
      id: { not: id },
      status: "ACTIVE",
      employmentType: { not: "INTERN" },
    },
    select: { id: true, name: true, email: true, position: true },
    orderBy: { name: "asc" },
  });

  const currentManagers = employee.managerIds?.length
    ? await prisma.employee.findMany({
        where: { id: { in: employee.managerIds } },
        select: { id: true, name: true, email: true, position: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Determine role
  const role = isDevAuthSkipped() ? "ADMIN" : (session?.user?.role || "STAFF");
  const isAdmin = role === "ADMIN";

  // Admins can edit any record regardless of which view they're in
  const canEdit = isAdmin;

  return (
    <div className="space-y-6">
      <EmployeeDetailEditable employee={employee} departments={departments} canEdit={canEdit} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Compensation — Intern variant: allowance-only, no CPF */}
        {employee.employmentType === "INTERN" && (
          <InternCompensationCard
            employeeId={employee.id}
            initialAllowance={Number(employee.salaryInfo?.allowances ?? 0)}
            canEdit={canEdit}
          />
        )}

        {/* Compensation — staff (always rendered; editable basic salary; auto-regenerates current-month payslip) */}
        {employee.employmentType !== "INTERN" && (
          <StaffCompensationCard
            employeeId={employee.id}
            initial={{
              basicSalary: Number(employee.salaryInfo?.basicSalary ?? 0),
              allowances: Number(employee.salaryInfo?.allowances ?? 0),
              cpfApplicable: employee.salaryInfo?.cpfApplicable ?? true,
              cpfEmployeeRate: Number(employee.salaryInfo?.cpfEmployeeRate ?? 20),
              cpfEmployerRate: Number(employee.salaryInfo?.cpfEmployerRate ?? 17),
              payNow: employee.salaryInfo?.payNow ?? null,
            }}
            canEdit={canEdit}
            hasSalaryInfo={!!employee.salaryInfo}
          />
        )}

        {/* Managers — admin can add / remove via the card */}
        <ManagersCard
          employeeId={employee.id}
          initialManagers={currentManagers}
          candidates={candidateManagers}
          canEdit={canEdit}
        />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {employee.leaveBalances
                  .filter((balance) => balance.year === new Date().getFullYear())
                  .map((balance) => {
                    const isAL = balance.leaveType.code === "AL";
                    const monthlyLeaveRate = employee.monthlyLeaveRate ? Number(employee.monthlyLeaveRate) : null;
                    // Compute the actual yearly entitlement for display
                    const displayEntitlement = isAL
                      ? (monthlyLeaveRate != null && monthlyLeaveRate < 12
                          ? monthlyLeaveRate
                          : employee.startDate
                          ? computeYearlyEntitlement(employee.startDate)
                          : Number(balance.entitlement))
                      : Number(balance.entitlement);
                    const allocation = isAL
                      ? prorateLeave(Number(balance.entitlement), employee.startDate ?? undefined, monthlyLeaveRate, true)
                      : Number(balance.entitlement);
                    const earned = Number(balance.earned ?? 0);
                    const totalBalance = allocation + earned + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending);
                    return (
                      <div key={balance.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-white">{balance.leaveType.name}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-gray-400 border-gray-700">
                              {balance.leaveType.code}
                            </Badge>
                            <LeaveBalanceEditDialog
                              employeeId={employee.id}
                              leaveBalanceId={balance.id}
                              leaveTypeName={balance.leaveType.name}
                              leaveTypeCode={balance.leaveType.code}
                              currentEntitlement={Number(balance.entitlement)}
                              currentCarriedOver={Number(balance.carriedOver)}
                              currentUsed={Number(balance.used)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Entitlement:</span>
                            <span className="text-white font-medium">
                              {displayEntitlement} days
                            </span>
                          </div>
                          {isAL && allocation !== displayEntitlement && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Allocation:</span>
                              <span className="text-cyan-400 font-medium">
                                {allocation} days <span className="text-gray-500 text-xs">(prorated)</span>
                              </span>
                            </div>
                          )}
                          {earned > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Earned (OT):</span>
                              <span className="text-emerald-400 font-medium">+{earned} days</span>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          {/* OT Work Log — admin can record weekend/PH work days */}
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Briefcase className="h-5 w-5" />
                OT Work Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AdminOtLogPanel employeeId={employee.id} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

