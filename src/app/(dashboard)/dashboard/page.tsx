import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { getViewMode } from "@/lib/view-mode";
import type { Role } from "@prisma/client";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getLeaveProfile } from "@/lib/leave-allowance";
import { loadLeaveSummary } from "@/lib/approval-summaries";
import { getInternAttendance, getLeaveOverview, getMonthlyLeaveSeries, getPendingApprovals, getWorkforceSnapshot } from "@/lib/hr-insights";
import { buildFindings } from "@/lib/hr-compliance";
import { AdminKpis } from "@/components/dashboard/admin-kpis";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { LeaveTrendChart } from "@/components/dashboard/leave-trend-chart";
import { WorkforceBreakdown } from "@/components/dashboard/workforce-breakdown";
import { getWorkforceBreakdown } from "@/lib/workforce-breakdown";
import { hasTrainerAdminAccess } from "@/lib/trainer-access";
import { getFinanceKpis, getTrainerKpis } from "@/lib/dashboard-kpis";
import { FinanceKpiRow, TrainerKpiRow } from "@/components/dashboard/role-kpis";

/**
 * Admin dashboard data: KPI tiles, the grouped "needs attention" summary and the monthly leave chart.
 * Details live on /dashboard/insights. Null on failure so the dashboard still renders.
 */
async function getAdminDashboard() {
  try {
    const now = new Date();
    const [people, interns, pending, series, workforce, breakdown] = await Promise.all([
      getLeaveOverview(now), getInternAttendance(14, now), getPendingApprovals(), getMonthlyLeaveSeries(now), getWorkforceSnapshot(),
      // The breakdown is an extra: if it fails, the rest of the dashboard still shows.
      getWorkforceBreakdown(now).catch((err) => { console.error("[dashboard] workforce breakdown failed:", err); return null; }),
    ]);
    const findings = buildFindings(people, interns);
    // Tiles and chart use the same series (approved days by start month) so their numbers always agree.
    const ytd = (cat: "LEAVE" | "MC" | "NPL") => series.reduce((t, m) => t + m.staff[cat] + m.interns[cat], 0);
    const thisMonth = (cat: "LEAVE" | "MC" | "NPL") => { const m = series[now.getMonth()]; return m ? m.staff[cat] + m.interns[cat] : 0; };
    const monthLabel = now.toLocaleDateString("en-SG", { month: "short", timeZone: "Asia/Singapore" });
    return {
      kpis: {
        staff: workforce.staff, interns: workforce.interns, onLeaveToday: workforce.onLeaveToday,
        pendingTotal: pending.leave + pending.mc + pending.timeOff + pending.corrections + pending.expenses,
        alertsTotal: new Set(findings.map((f) => `${f.employeeId}:${f.category}`)).size,
        alertsHigh: findings.filter((f) => f.severity === "high").length,
        leaveYtd: ytd("LEAVE"), mcYtd: ytd("MC"), nplYtd: ytd("NPL"),
        leaveMonth: thisMonth("LEAVE"), mcMonth: thisMonth("MC"), nplMonth: thisMonth("NPL"),
        internHoursWeek: interns.reduce((t, i) => t + i.weekHours, 0),
        missingClockOuts: interns.reduce((t, i) => t + i.missingClockOuts.length, 0),
        monthLabel,
      },
      findings, pending, series, breakdown, year: now.getFullYear(),
    };
  } catch (err) {
    console.error("[dashboard] admin dashboard data failed:", err);
    return null;
  }
}

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

/**
 * A staff member's or intern's own leave tiles. They come from loadLeaveSummary(), the same
 * summary the decision email and the approval page show, so the dashboard can never disagree
 * with the email. Off In Lieu is an extra tile, shown only when there is any.
 */
async function getStaffStats(employeeId: string) {
  const currentYear = new Date().getFullYear();
  const [summary, profile, otBalance] = await Promise.all([
    loadLeaveSummary(employeeId, currentYear),
    getLeaveProfile(employeeId),
    prisma.leaveBalance.findFirst({ where: { employeeId, year: currentYear, leaveType: { code: "AL_OT" } } }),
  ]);
  if (!summary) return null;

  const otEarned = otBalance ? Number(otBalance.earned) : 0;
  const otUsed = otBalance ? Math.max(0, Number(otBalance.used)) : 0;
  const otAutoDeducted = otBalance ? Math.max(0, Number(otBalance.autoDeducted)) : 0;
  const otPending = otBalance ? Math.max(0, Number(otBalance.pending)) : 0;
  const otRemaining = otEarned - otUsed - otAutoDeducted - otPending;
  const otStats = otEarned > 0 || otRemaining < 0
    ? { earned: otEarned, used: otUsed, autoDeducted: otAutoDeducted, remaining: otRemaining }
    : null;

  return { leave: summary.stats, isIntern: !!profile?.isIntern, otStats };
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
  const [session, viewMode] = await Promise.all([auth(), getViewMode()]);

  let role: Role = "STAFF";
  let roles: string[] = [];
  let currentEmployeeId: string | undefined;
  let displayName = "User";

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    roles = ["ADMIN", "TRAINER_ADMIN"];
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
    roles = session.user.roles ?? [];
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

  // The dashboard follows the person's role (Alfred, 20 Nov 2026):
  //   admin view      -> staff, interns, pending approvals
  //   accountant view -> pending claims, income, expenses
  //   staff / intern  -> own paid leave taken, annual leave balance, MC taken, no-pay leave taken (as in the decision email)
  //   Trainer Admins  -> trainers, ACLP, non-ACLP, as a second row under their own (not in accountant view)
  // Admins pick the view; an accountant always gets the accountant view, with their own leave row under it.
  const isAdmin = hasAdminAccess(role);
  const isAccountant = !isAdmin && roles.includes("ACCOUNTANT");
  const viewAs = isAdmin ? viewMode : isAccountant ? "accountant" : "staff";

  const isAdminView = viewAs === "admin";
  const isAccountantView = viewAs === "accountant";
  const isStaffView = !isAdminView;
  const showOwnLeave = !isAdminView && (!isAccountantView || isAccountant);
  // Trainer Management follows its own role, in every view except the accountant view (finance only).
  const showTrainers = hasTrainerAdminAccess(roles) && !isAccountantView;

  // For non-admin views: filter recent activity by own employee ID
  const activityEmployeeId = isStaffView ? currentEmployeeId : undefined;
  // Independent loaders run together. A row that fails to load is left out; the rest still shows.
  const optional = <T,>(label: string, load: Promise<T>): Promise<T | null> =>
    load.catch((err) => { console.error(`[dashboard] ${label} failed:`, err); return null; });
  const [activity, adminDash, finance, trainers, staffStats] = await Promise.all([
    getRecentActivity(activityEmployeeId),
    isAdminView ? getAdminDashboard() : Promise.resolve(null),
    isAccountantView ? optional("finance KPIs", getFinanceKpis()) : Promise.resolve(null),
    showTrainers ? optional("trainer KPIs", getTrainerKpis()) : Promise.resolve(null),
    showOwnLeave && currentEmployeeId ? getStaffStats(currentEmployeeId) : Promise.resolve(null),
  ]);
  // Fallback tiles when the admin dashboard failed to load.
  const adminStats = isAdminView && !adminDash ? await getAdminStats() : null;

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Welcome Back, {displayName}
          </h1>
          <p className="text-gray-400 mt-1">
            Here&apos;s what&apos;s happening in your organization
          </p>
        </div>
        {adminDash && (
          <Link href="/dashboard/analytics" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-950 px-3 py-1.5 text-sm text-gray-300 hover:border-primary/60 hover:text-white">
            <BarChart3 className="h-4 w-4" /> Analytics
          </Link>
        )}
      </div>

      {adminDash ? (
        <>
          {/* KPI tiles — each opens its detail */}
          <AdminKpis {...adminDash.kpis} />
          {trainers && <TrainerKpiRow {...trainers} title="Trainer Management" />}
          {/* Grouped alerts + the one chart */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <div className="xl:col-span-2"><NeedsAttention findings={adminDash.findings} pending={adminDash.pending} /></div>
            <div className="xl:col-span-3"><LeaveTrendChart data={adminDash.series} year={adminDash.year} /></div>
          </div>
          {adminDash.breakdown && <WorkforceBreakdown people={adminDash.breakdown} />}
        </>
      ) : (
        <>
          {finance && <FinanceKpiRow {...finance} />}
          {(adminStats || staffStats) && <StatsCards adminStats={adminStats} staffStats={staffStats} />}
          {trainers && <TrainerKpiRow {...trainers} title={adminStats || staffStats ? "Trainer Management" : undefined} />}
        </>
      )}

      {/* Quick Actions and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <QuickActions isAdmin={isAdminView} isAccountant={isAccountantView} />
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
