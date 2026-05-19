import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prorateLeave, computeAlFullEntitlement } from "@/lib/utils";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { isDevAuthSkipped } from "@/lib/dev-auth";

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

async function getAlData(employeeId: string): Promise<{
  earned: number;       // prorated to today
  fullAvailable: number; // full-year entitlement - used - pending
  personalEntitlement: number; // the total days they're entitled to this year
}> {
  const currentYear = new Date().getFullYear();
  const alType = await prisma.leaveType.findUnique({ where: { code: "AL" } });
  if (!alType) return { earned: 0, fullAvailable: 0, personalEntitlement: 12 };

  const [balance, employee] = await Promise.all([
    prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: alType.id, year: currentYear } },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { startDate: true, monthlyLeaveRate: true },
    }),
  ]);

  const monthlyLeaveRate = employee?.monthlyLeaveRate ? Number(employee.monthlyLeaveRate) : null;
  const personalEntitlement = computeAlFullEntitlement(employee?.startDate, monthlyLeaveRate);

  if (!balance) return { earned: 0, fullAvailable: personalEntitlement, personalEntitlement };

  const earned = prorateLeave(Number(balance.entitlement), employee?.startDate ?? undefined, null, true);
  const fullAvailable = personalEntitlement + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending);

  return { earned, fullAvailable, personalEntitlement };
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

  const [leaveTypes, otBalance, alData] = await Promise.all([
    getLeaveTypes(),
    employeeId ? getOtBalance(employeeId) : Promise.resolve(0),
    employeeId ? getAlData(employeeId) : Promise.resolve({ earned: 0, fullAvailable: 12, personalEntitlement: 12 }),
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
        alEarned={alData.earned}
        alFullAvailable={alData.fullAvailable}
        alPersonalEntitlement={alData.personalEntitlement}
        defaultLeaveTypeCode={params.type}
      />
    </div>
  );
}
