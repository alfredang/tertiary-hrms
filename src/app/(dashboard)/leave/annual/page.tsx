import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prorateLeave, hasAdminAccess } from "@/lib/utils";
import { LeaveList } from "@/components/leave/leave-list";
import { LeaveBalanceCards } from "@/components/leave/leave-balance-cards";
import { OtBreakdownDialog } from "@/components/leave/ot-breakdown-dialog";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from "lucide-react";
import { isDevAuthSkipped } from "@/lib/dev-auth";

async function getOtLeaveBalance(employeeId: string) {
  const currentYear = new Date().getFullYear();
  const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
  if (!alOtType) return null;

  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year: currentYear } },
  });
  if (!balance) return { earned: 0, used: 0, autoDeducted: 0, pending: 0, remaining: 0 };

  const earned = Number(balance.earned);
  // Clamp used/pending to non-negative to guard against stale data from reset flows
  const used = Math.max(0, Number(balance.used));
  const autoDeducted = Math.max(0, Number(balance.autoDeducted));
  const pending = Math.max(0, Number(balance.pending));
  // Allow negative remaining — represents deficit owed back via future OT work
  const remaining = earned - used - autoDeducted - pending;
  return { earned, used, autoDeducted, pending, remaining };
}

export const dynamic = 'force-dynamic';

async function getLeaveBalance(employeeId: string) {
  const currentYear = new Date().getFullYear();

  const annualLeaveType = await prisma.leaveType.findUnique({
    where: { code: "AL" },
  });

  if (!annualLeaveType) {
    return { carriedOver: 0, allocation: 12, taken: 0, rejected: 0, proRated: 12 };
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

  // Get employee start date and monthly leave rate for proration
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { startDate: true, endDate: true, monthlyLeaveRate: true },
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
  const monthlyLeaveRate = employee?.monthlyLeaveRate ? Number(employee.monthlyLeaveRate) : null;
  const proRated = prorateLeave(allocation, employee?.startDate ?? undefined, monthlyLeaveRate, true);
  const employeeStartDate = employee?.startDate?.toISOString() ?? null;
  const employeeEndDate = employee?.endDate?.toISOString() ?? null;

  return { carriedOver, allocation, taken, rejected: rejectedCount, proRated, employeeStartDate, employeeEndDate, monthlyLeaveRate };
}

async function getLeaveRequests(employeeId?: string) {
  // Annual Leave page: show AL + AL_OT requests only. MC requests live on the
  // /leave/medical page.
  const alType = await prisma.leaveType.findUnique({ where: { code: "AL" } });
  const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
  const typeIds = [alType?.id, alOtType?.id].filter((x): x is string => !!x);

  const where = {
    ...(employeeId ? { employeeId } : {}),
    ...(typeIds.length ? { leaveTypeId: { in: typeIds } } : {}),
  };

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

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";

  // Admin view: show all leaves; Staff view: show only own leaves
  const filterByEmployeeId = viewAs !== "admin" ? currentEmployeeId : undefined;

  // Safety: prevent data leak if staff view but no employeeId
  if (viewAs !== "admin" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Annual Leave</h1>
        <p className="text-sm sm:text-base text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const [leaveBalance, otBalance, requests] = await Promise.all([
    currentEmployeeId
      ? getLeaveBalance(currentEmployeeId)
      : Promise.resolve({ carriedOver: 0, allocation: 12, taken: 0, rejected: 0, proRated: 12, employeeStartDate: null, employeeEndDate: null, monthlyLeaveRate: null }),
    currentEmployeeId ? getOtLeaveBalance(currentEmployeeId) : Promise.resolve(null),
    getLeaveRequests(filterByEmployeeId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Annual Leave</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {viewAs === "admin"
              ? "Manage all employee annual leave requests"
              : "Paid annual leave — prorated from your join date"}
          </p>
        </div>
        {viewAs !== "admin" && (
          <Link href="/leave/request" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Request Leave
            </Button>
          </Link>
        )}
      </div>

      {/* Paid / Unpaid status pill */}
      {viewAs !== "admin" && (
        <div className="inline-flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-950/50 border border-green-800 text-green-300">
            Paid Leave
          </span>
        </div>
      )}

      {/* Expiring carry-over leave warning — show in Q4 (Oct-Dec) */}
      {viewAs !== "admin" && leaveBalance.carriedOver > 0 && new Date().getMonth() >= 9 && (
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            You have <span className="font-semibold text-amber-100">{leaveBalance.carriedOver} days</span> of carried-over annual leave expiring on 31 Dec {new Date().getFullYear()}. Please clear them before they are forfeited.
          </p>
        </div>
      )}

      {/* Leave Balance Summary - only show for staff view */}
      {viewAs !== "admin" && (
        <LeaveBalanceCards
          leaveBalance={leaveBalance}
          employeeStartDate={leaveBalance.employeeStartDate ?? null}
          employeeEndDate={leaveBalance.employeeEndDate ?? null}
          monthlyLeaveRate={leaveBalance.monthlyLeaveRate ?? null}
        />
      )}

      {/* OT Leave Balance — show when earned > 0 OR there is a deficit */}
      {viewAs !== "admin" && otBalance !== null && (otBalance.earned > 0 || otBalance.remaining < 0) && (
        <div className={`bg-gray-950 border rounded-xl p-4 ${otBalance.remaining < 0 ? "border-red-800/50" : "border-emerald-800/40"}`}>
          <div className="mb-3">
            <OtBreakdownDialog
              otStats={otBalance}
              employeeId={currentEmployeeId}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Earned</p>
              <p className="text-xl font-bold text-emerald-400">{otBalance.earned}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Used</p>
              <p className="text-xl font-bold text-amber-400">{otBalance.used}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Deficit</p>
              <p className="text-xl font-bold text-red-400">{otBalance.autoDeducted}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Remaining</p>
              <p className={`text-xl font-bold ${otBalance.remaining < 0 ? "text-red-400" : "text-green-400"}`}>
                {otBalance.remaining}
              </p>
            </div>
          </div>
          {otBalance.remaining < 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Work on weekends or public holidays to earn OT days and reduce this deficit.
            </p>
          )}
        </div>
      )}

      <LeaveList requests={requests} isManager={viewAs === "admin"} />
    </div>
  );
}
