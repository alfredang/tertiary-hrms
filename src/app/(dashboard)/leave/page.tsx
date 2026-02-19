import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prorateLeave } from "@/lib/utils";
import { LeaveList } from "@/components/leave/leave-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
  const proRated = prorateLeave(allocation);

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
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { firstName: true, lastName: true } },
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

  if (process.env.SKIP_AUTH === "true") {
    role = "ADMIN";
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
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
        <h1 className="text-3xl font-bold text-white">Leave Management</h1>
        <p className="text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Leave Management</h1>
          <p className="text-gray-400 mt-1">
            {viewAs === "admin" ? "Manage all employee leave requests" : "Manage time off requests"}
          </p>
        </div>
        {viewAs === "staff" && (
          <Link href="/leave/request">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Request Leave
            </Button>
          </Link>
        )}
      </div>

      {/* Leave Balance Summary - only show for staff view */}
      {viewAs === "staff" && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Balance from Last Year</p>
            <p className="text-2xl font-bold text-white">{leaveBalance.carriedOver}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Allocation This Year</p>
            <p className="text-2xl font-bold text-blue-400">{leaveBalance.allocation}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Leave Taken</p>
            <p className="text-2xl font-bold text-amber-400">{leaveBalance.taken}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Leave Rejected</p>
            <p className="text-2xl font-bold text-red-400">{leaveBalance.rejected}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Balance (Pro-rate)</p>
            <p className="text-2xl font-bold text-green-400">{leaveBalance.proRated}</p>
          </div>
        </div>
      )}

      <LeaveList requests={requests} isManager={viewAs === "admin"} />
    </div>
  );
}
