import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { LeaveList } from "@/components/leave/leave-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Stethoscope } from "lucide-react";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

async function getMcLeaveType() {
  const row =
    (await prisma.leaveType.findUnique({ where: { code: "MC" } })) ??
    (await prisma.leaveType.findFirst({
      where: { code: { in: ["SL", "MEDICAL"] } },
    })) ??
    (await prisma.leaveType.findFirst({
      where: { name: { contains: "Medical", mode: "insensitive" } },
    }));
  return row;
}

async function getMcBalance(employeeId: string, mcTypeId: string) {
  const currentYear = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: { employeeId, leaveTypeId: mcTypeId, year: currentYear },
    },
  });
  if (!balance) return { entitlement: 0, used: 0, pending: 0, remaining: 0 };

  const entitlement = Number(balance.entitlement);
  const used = Math.max(0, Number(balance.used));
  const pending = Math.max(0, Number(balance.pending));
  return { entitlement, used, pending, remaining: entitlement - used - pending };
}

async function getMcRequests(mcTypeId: string, employeeId?: string) {
  return prisma.leaveRequest.findMany({
    where: { leaveTypeId: mcTypeId, ...(employeeId ? { employeeId } : {}) },
    include: {
      employee: {
        select: { id: true, name: true, department: { select: { name: true } } },
      },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function MedicalLeavePage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role = "STAFF";
  let currentEmployeeId: string | undefined;
  let employmentType: string | null = null;

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true, employmentType: true } } },
    });
    currentEmployeeId = adminUser?.employee?.id;
    employmentType = adminUser?.employee?.employmentType ?? null;
  } else {
    if (!session?.user) return null;
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
    if (currentEmployeeId) {
      const e = await prisma.employee.findUnique({
        where: { id: currentEmployeeId },
        select: { employmentType: true },
      });
      employmentType = e?.employmentType ?? null;
    }
  }

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";
  const filterByEmployeeId = viewAs !== "admin" ? currentEmployeeId : undefined;

  if (viewAs !== "admin" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Medical Leave</h1>
        <p className="text-sm sm:text-base text-gray-400">
          Your employee profile has not been set up yet. Please contact HR.
        </p>
      </div>
    );
  }

  const mcType = await getMcLeaveType();
  const isIntern = employmentType === "INTERN";
  // paidDays: 0 = fully paid; N > 0 = only N days are paid, rest are unpaid
  const rawPaidDays = mcType?.paidDays ?? 0;
  const totalDays = mcType?.defaultDays ?? 14;
  const paidMcDays = isIntern ? 0 : (rawPaidDays > 0 ? rawPaidDays : totalDays);
  const unpaidMcDays = isIntern ? totalDays : totalDays - paidMcDays;
  const isPartiallyPaid = !isIntern && unpaidMcDays > 0;

  const [balance, requests] = await Promise.all([
    mcType && currentEmployeeId
      ? getMcBalance(currentEmployeeId, mcType.id)
      : Promise.resolve({ entitlement: 0, used: 0, pending: 0, remaining: 0 }),
    mcType
      ? getMcRequests(mcType.id, filterByEmployeeId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <Stethoscope className="h-7 w-7 text-primary" />
            Medical Leave
          </h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {viewAs === "admin"
              ? "Manage all employee medical leave requests"
              : isIntern
                ? `Unpaid medical leave — up to ${totalDays} days per year`
                : isPartiallyPaid
                  ? `Medical leave — ${totalDays} days/year (${paidMcDays} paid + ${unpaidMcDays} unpaid)`
                  : `Paid medical leave — ${totalDays} days per year`}
          </p>
        </div>
        {viewAs !== "admin" && (
          <Link href="/leave/request?type=MC" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Request MC
            </Button>
          </Link>
        )}
      </div>

      {/* Paid / Unpaid status pills */}
      {viewAs !== "admin" && (
        <div className="inline-flex items-center gap-2 flex-wrap">
          {isIntern ? (
            <>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-800 text-amber-300">
                Unpaid Leave
              </span>
              <span className="text-xs text-gray-500">Interns do not accrue paid medical leave.</span>
            </>
          ) : isPartiallyPaid ? (
            <>
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-950/50 border border-green-800 text-green-300">
                {paidMcDays} days Paid
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-800 text-amber-300">
                {unpaidMcDays} days Unpaid
              </span>
            </>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-950/50 border border-green-800 text-green-300">
              Paid Leave
            </span>
          )}
        </div>
      )}

      {/* Balance Summary - staff view only */}
      {viewAs !== "admin" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-400 mb-1">Yearly Entitlement</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-400">{balance.entitlement}</p>
            {isPartiallyPaid && (
              <p className="text-xs text-gray-600 mt-1">{paidMcDays} paid · {unpaidMcDays} unpaid</p>
            )}
          </div>
          <BalanceCard label="MC Taken" value={balance.used} color="text-amber-400" />
          <BalanceCard label="Pending" value={balance.pending} color="text-purple-400" />
          <BalanceCard
            label="Remaining"
            value={balance.remaining}
            color={balance.remaining < 0 ? "text-red-400" : "text-green-400"}
          />
        </div>
      )}

      {viewAs === "admin" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total Requests" value={requests.length} color="text-white" />
          <KpiCard label="Pending" value={requests.filter((r) => r.status === "PENDING").length} color="text-amber-400" />
          <KpiCard label="Approved" value={requests.filter((r) => r.status === "APPROVED").length} color="text-green-400" />
          <KpiCard label="Rejected" value={requests.filter((r) => r.status === "REJECTED").length} color="text-red-400" />
        </div>
      )}

      <LeaveList requests={requests} isManager={viewAs === "admin"} />
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
      <p className="text-xs sm:text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function BalanceCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
      <p className="text-xs sm:text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
