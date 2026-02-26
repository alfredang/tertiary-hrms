import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prorateLeave } from "@/lib/utils";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { getViewMode } from "@/lib/view-mode";
import type { Role } from "@prisma/client";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = 'force-dynamic';

async function getAdminStats() {
  const mcLeaveType = await prisma.leaveType.findUnique({ where: { code: "MC" } });

  const [pendingLeaves, pendingMC, pendingClaims] = await Promise.all([
    prisma.leaveRequest.count({
      where: { status: "PENDING", ...(mcLeaveType ? { leaveTypeId: { not: mcLeaveType.id } } : {}) },
    }),
    mcLeaveType
      ? prisma.leaveRequest.count({ where: { status: "PENDING", leaveTypeId: mcLeaveType.id } })
      : Promise.resolve(0),
    prisma.expenseClaim.count({ where: { status: "PENDING" } }),
  ]);

  return { pendingLeaves, pendingMC, pendingClaims };
}

async function getStaffStats(employeeId: string) {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(`${currentYear}-01-01`);

  const [alType, mcType] = await Promise.all([
    prisma.leaveType.findUnique({ where: { code: "AL" } }),
    prisma.leaveType.findUnique({ where: { code: "MC" } }),
  ]);

  const [alBalance, mcBalance, expenseClaims, employee] = await Promise.all([
    alType
      ? prisma.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alType.id, year: currentYear } },
        })
      : null,
    mcType
      ? prisma.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: mcType.id, year: currentYear } },
        })
      : null,
    prisma.expenseClaim.findMany({
      where: {
        employeeId,
        createdAt: { gte: yearStart },
        status: "APPROVED",
      },
      select: { amount: true },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { startDate: true },
    }),
  ]);

  // Fall back to leave type default if no balance record exists (same as leave page)
  const alAllocation = alBalance ? Number(alBalance.entitlement) : (alType?.defaultDays ?? 0);
  const alEntitlement = prorateLeave(alAllocation, employee?.startDate ?? undefined);
  const alCarriedOver = alBalance ? Number(alBalance.carriedOver) : 0;
  const alUsed = alBalance ? Number(alBalance.used) : 0;
  const alPending = alBalance ? Number(alBalance.pending) : 0;
  const leaveBalance = alEntitlement + alCarriedOver - alUsed - alPending;

  const mcAllocation = mcBalance ? Number(mcBalance.entitlement) : (mcType?.defaultDays ?? 0);
  const mcEntitlement = prorateLeave(mcAllocation, employee?.startDate ?? undefined);
  const mcCarriedOver = mcBalance ? Number(mcBalance.carriedOver) : 0;
  const mcUsed = mcBalance ? Number(mcBalance.used) : 0;
  const mcPending = mcBalance ? Number(mcBalance.pending) : 0;
  const mcBalanceVal = mcEntitlement + mcCarriedOver - mcUsed - mcPending;
  const expenseClaimAmount = expenseClaims.reduce((sum, c) => sum + Number(c.amount), 0);

  return { leaveBalance, mcBalance: mcBalanceVal, expenseClaimAmount };
}

async function getRecentActivity(employeeId?: string) {
  const employeeFilter = employeeId ? { employeeId } : {};

  const [recentExpenses, recentLeaves] = await Promise.all([
    prisma.expenseClaim.findMany({
      take: 5,
      where: employeeFilter,
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      take: 5,
      where: employeeFilter,
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { name: true } },
        leaveType: { select: { name: true } },
      },
    }),
  ]);

  // Serialize Prisma Decimal/Date objects for client component props
  return {
    recentExpenses: recentExpenses.map((e) => ({
      id: e.id,
      amount: Number(e.amount),
      description: e.description,
      createdAt: e.createdAt.toISOString(),
      employee: e.employee,
      category: e.category,
    })),
    recentLeaves: recentLeaves.map((l) => ({
      id: l.id,
      days: Number(l.days),
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
      createdAt: l.createdAt.toISOString(),
      employee: l.employee,
      leaveType: l.leaveType,
    })),
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role: Role = "STAFF";
  let currentEmployeeId: string | undefined;
  let displayName = "User";

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true, name: true } } },
    });
    if (adminUser?.employee) {
      currentEmployeeId = adminUser.employee.id;
      displayName = adminUser.employee.name;
    }
  } else if (session?.user) {
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
    if (currentEmployeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: currentEmployeeId },
        select: { name: true },
      });
      if (employee) {
        displayName = employee.name;
      }
    }
  }

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewAs = isAdmin ? viewMode : "staff";

  // For staff view: filter recent activity by own employee ID
  const activityEmployeeId = viewAs === "staff" ? currentEmployeeId : undefined;
  const activity = await getRecentActivity(activityEmployeeId);

  // For admin users, fetch both stats so they can toggle views
  const adminStats = isAdmin ? await getAdminStats() : null;
  const staffStats = currentEmployeeId ? await getStaffStats(currentEmployeeId) : null;

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome Back, {displayName}
        </h1>
        <p className="text-gray-400 mt-1">
          Here&apos;s what&apos;s happening in your organization
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards
        adminStats={viewAs === "admin" ? adminStats : null}
        staffStats={viewAs === "staff" ? staffStats : null}
      />

      {/* Quick Actions and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <QuickActions isAdmin={viewAs === "admin"} />
        </div>
        <div>
          <RecentActivity
            expenses={activity.recentExpenses}
            leaves={activity.recentLeaves}
          />
        </div>
      </div>
    </div>
  );
}
