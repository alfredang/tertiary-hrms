import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getLeaveProfile, getNplStatus, type LeaveProfile } from "@/lib/leave-allowance";
import { NPL_ANNUAL_CAP_DAYS, type NplStatus } from "@/lib/leave-policy";
import { getAnnualLeaveBalance } from "@/lib/annual-leave";
import { annualLeaveAmounts } from "@/lib/annual-leave-policy";

export const dynamic = "force-dynamic";

async function getLeaveTypes() {
  return prisma.leaveType.findMany({ orderBy: { name: "asc" } });
}

async function getOtBalance(employeeId: string): Promise<number> {
  const currentYear = new Date().getFullYear();
  const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });
  if (!alOtType) return 0;

  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alOtType.id, year: currentYear } },
  });
  if (!balance) return 0;
  return Math.max(0, Number(balance.earned) - Number(balance.used) - Number(balance.autoDeducted) - Number(balance.pending));
}

async function getAlData(employeeId: string, employee: LeaveProfile | null): Promise<{
  remaining: number;     // earned to date + carried over - used - pending (same as the Annual Leave page)
  fullAvailable: number; // full-year entitlement - used - pending
  personalEntitlement: number; // total for the calendar year or configured internship
  periodEnd?: string;
}> {
  const alType = await prisma.leaveType.findUnique({ where: { code: "AL" } });
  if (!alType) return { remaining: 0, fullAvailable: 0, personalEntitlement: 7 };

  const balance = await getAnnualLeaveBalance(employeeId, alType.id);

  const yearlyEntitlement = balance ? Number(balance.entitlement) : alType.defaultDays;
  const amounts = annualLeaveAmounts({
    entitlement: yearlyEntitlement,
    used: Number(balance?.used ?? 0), pending: Number(balance?.pending ?? 0), carriedOver: Number(balance?.carriedOver ?? 0),
    periodStart: balance?.periodStart, periodEnd: balance?.periodEnd,
  }, employee);
  return {
    remaining: amounts.remaining, fullAvailable: amounts.fullAvailable, personalEntitlement: amounts.fullEntitlement,
    ...(amounts.isContract && balance?.periodEnd ? { periodEnd: balance.periodEnd.toISOString().slice(0, 10) } : {}),
  };
}

export default async function LeaveRequestPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>;
}) {
  const params = (await searchParams) ?? {};
  let employeeId: string | undefined;

  if (isDevAuthSkipped()) {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    employeeId = adminUser?.employee?.id;
  } else {
    const session = await auth();
    employeeId = session?.user?.employeeId;
  }

  const profile = employeeId ? await getLeaveProfile(employeeId) : null;
  const emptyNpl: NplStatus = { cap: 0, used: 0, pending: 0, remaining: 0 };

  const [leaveTypes, otBalance, alData, npl] = await Promise.all([
    getLeaveTypes(),
    employeeId ? getOtBalance(employeeId) : Promise.resolve(0),
    employeeId ? getAlData(employeeId, profile) : Promise.resolve({ remaining: 0, fullAvailable: 7, personalEntitlement: 7, periodEnd: undefined }),
    employeeId ? getNplStatus(employeeId, profile) : Promise.resolve(emptyNpl),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Request Leave</h1>
        <p className="text-gray-400 mt-1">Submit a new leave application</p>
      </div>

      <LeaveRequestForm
        leaveTypes={leaveTypes}
        otBalance={otBalance}
        alRemaining={alData.remaining}
        alFullAvailable={alData.fullAvailable}
        alPersonalEntitlement={alData.personalEntitlement}
        alEntitlementPeriodEnd={alData.periodEnd}
        defaultLeaveTypeCode={params.type}
        isIntern={profile?.isIntern ?? false}
        npl={npl}
        nplAnnualCap={NPL_ANNUAL_CAP_DAYS}
      />
    </div>
  );
}
