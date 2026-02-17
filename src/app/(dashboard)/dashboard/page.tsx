import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { COMPANY_NAME } from "@/lib/constants";

export const dynamic = 'force-dynamic';

async function getDashboardStats() {
  const [
    totalEmployees,
    activeEmployees,
    pendingLeaves,
    pendingExpenses,
    totalExpensesThisMonth,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.expenseClaim.count({ where: { status: "PENDING" } }),
    prisma.expenseClaim.aggregate({
      _sum: { amount: true },
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ]);

  return {
    totalEmployees,
    activeEmployees,
    pendingLeaves,
    pendingExpenses,
    totalExpensesThisMonth: Number(totalExpensesThisMonth._sum.amount || 0),
  };
}

async function getRecentActivity() {
  const [recentExpenses, recentLeaves] = await Promise.all([
    prisma.expenseClaim.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        leaveType: { select: { name: true } },
      },
    }),
  ]);

  return { recentExpenses, recentLeaves };
}

export default async function DashboardPage() {
  const session = await auth();
  const stats = await getDashboardStats();
  const activity = await getRecentActivity();

  const firstName = session?.user?.name?.split(" ")[0] || "User";

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {firstName}.
        </h1>
        <p className="text-gray-400 mt-1">
          Here&apos;s what&apos;s happening in your organization
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={stats} />

      {/* Quick Actions and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <QuickActions />
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
