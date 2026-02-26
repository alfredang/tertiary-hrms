import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prorateLeave } from "@/lib/utils";
import { LeaveList } from "@/components/leave/leave-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from "lucide-react";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = 'force-dynamic';

async function getLeaveBalance(employeeId: string) {
  const currentYear = new Date().getFullYear();

  const annualLeaveType = await prisma.leaveType.findUnique({
    where: { code: "AL" },
  });

  if (!annualLeaveType) {
    return { carriedOver: 0, allocation: 14, taken: 0, rejected: 0, proRated: 14 };
  }

  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId,
        leaveTypeId: annualLeaveType.id,
        year: currentYear,
      },
    },
  });

  // Get employee start date for proration
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { startDate: true },
  });

  const rejectedCount = await prisma.leaveRequest.count({
    where: {
      employeeId,
      leaveTypeId: annualLeaveType.id,
      status: "REJECTED",
      startDate: { gte: new Date(`${currentYear}-01-01`) },
    },
  });

  const allocation = balance ? Number(balance.entitlement) : annualLeaveType.defaultDays;
  const carriedOver = balance ? Number(balance.carriedOver) : 0;
  const taken = balance ? Number(balance.used) : 0;
  const proRated = prorateLeave(allocation, employee?.startDate ?? undefined);

  return { carriedOver, allocation, taken, rejected: rejectedCount, proRated };
}

async function getLeaveRequests(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
        },
      },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests;
}

export default async function LeavePage() {
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
      return null;
    }
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
  }

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewAs = isAdmin ? viewMode : "staff";

  // Admin view: show all leaves; Staff view: show only own leaves
  const filterByEmployeeId = viewAs === "staff" ? currentEmployeeId : undefined;

  // Safety: prevent data leak if staff view but no employeeId
  if (viewAs === "staff" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Leave Management</h1>
        <p className="text-sm sm:text-base text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const [leaveBalance, requests] = await Promise.all([
    currentEmployeeId
      ? getLeaveBalance(currentEmployeeId)
      : Promise.resolve({ carriedOver: 0, allocation: 14, taken: 0, rejected: 0, proRated: 14 }),
    getLeaveRequests(filterByEmployeeId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Leave Management</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {viewAs === "admin" ? "Manage all employee leave requests" : "Manage time off requests"}
          </p>
        </div>
        {viewAs === "staff" && (
          <Link href="/leave/request" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Request Leave
            </Button>
          </Link>
        )}
      </div>

      {/* Expiring carry-over leave warning — show in Q4 (Oct-Dec) */}
      {viewAs === "staff" && leaveBalance.carriedOver > 0 && new Date().getMonth() >= 9 && (
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            You have <span className="font-semibold text-amber-100">{leaveBalance.carriedOver} days</span> of carried-over annual leave expiring on 31 Dec {new Date().getFullYear()}. Please clear them before they are forfeited.
          </p>
        </div>
      )}

      {/* Leave Balance Summary - only show for staff view */}
      {viewAs === "staff" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-400 mb-1">Balance</p>
            <p className="text-xl sm:text-2xl font-bold text-green-400">{leaveBalance.proRated + leaveBalance.carriedOver - leaveBalance.taken}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-400 mb-1">Pro-rated Allocation</p>
            <p className="text-xl sm:text-2xl font-bold text-cyan-400">{leaveBalance.proRated}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-400 mb-1">Carry-over</p>
            <p className="text-xl sm:text-2xl font-bold text-purple-400">{leaveBalance.carriedOver}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-400 mb-1">Leave Taken</p>
            <p className="text-xl sm:text-2xl font-bold text-amber-400">{leaveBalance.taken}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-400 mb-1">Rejected</p>
            <p className="text-xl sm:text-2xl font-bold text-red-400">{leaveBalance.rejected}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-400 mb-1">Yearly Entitlement</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-400">{leaveBalance.allocation}</p>
          </div>
        </div>
      )}

      <LeaveList requests={requests} isManager={viewAs === "admin"} />
    </div>
  );
}
