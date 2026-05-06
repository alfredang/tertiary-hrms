import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

export default async function LeaveRequestPage() {
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

  const [leaveTypes, otBalance] = await Promise.all([
    getLeaveTypes(),
    employeeId ? getOtBalance(employeeId) : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Request Leave</h1>
        <p className="text-gray-400 mt-1">Submit a new leave application</p>
      </div>

      <LeaveRequestForm leaveTypes={leaveTypes} otBalance={otBalance} />
    </div>
  );
}
