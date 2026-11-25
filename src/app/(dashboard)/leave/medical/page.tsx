import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess, prorateLeave } from "@/lib/utils";
import { getLeaveProfile, getNplStatus, type LeaveProfile } from "@/lib/leave-allowance";
import { mcAnnualEntitlement, NPL_ANNUAL_CAP_DAYS, NPL_CODE } from "@/lib/leave-policy";
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

async function getMcBalance(employeeId: string, mcTypeId: string, profile: LeaveProfile | null) {
  const currentYear = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: { employeeId, leaveTypeId: mcTypeId, year: currentYear },
    },
  });
  if (!balance) return { entitlement: 0, earned: 0, used: 0, pending: 0, remaining: 0 };

  // Yearly MC (0 for interns), earned strictly by completed months served this year.
  const entitlement = mcAnnualEntitlement(Number(balance.entitlement), !!profile?.isIntern);
  const earned = prorateLeave(entitlement, profile?.startDate, null, false, new Date(), profile?.endDate);
  const used = Math.max(0, Number(balance.used));
  const pending = Math.max(0, Number(balance.pending));
  return { entitlement, earned, used, pending, remaining: earned + Number(balance.carriedOver) - used - pending };
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

/** An intern's sick leave: No Pay Leave requests filed through "Request MC" (reason starts "Sick leave (MC)"). */
async function getInternSickRequests(employeeId: string) {
  return prisma.leaveRequest.findMany({
    where: { employeeId, leaveType: { code: NPL_CODE }, reason: { startsWith: "Sick leave (MC)" } },
    include: {
      employee: { select: { id: true, name: true, department: { select: { name: true } } } },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function MedicalLeavePage() {
  const [session, viewMode] = await Promise.all([auth(), getViewMode()]);

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
    if (!session?.user) return null;
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
  }
  // Intern = roles exactly ["INTERN"] (admins hold INTERN too, to switch views).
  const [profile, mcType] = await Promise.all([
    currentEmployeeId ? getLeaveProfile(currentEmployeeId) : Promise.resolve(null),
    getMcLeaveType(),
  ]);

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

  const isIntern = !!profile?.isIntern;
  // paidDays: 0 = fully paid; N > 0 = only N days are paid, rest are unpaid
  const rawPaidDays = mcType?.paidDays ?? 0;
  const totalDays = mcType?.defaultDays ?? 14;
  const paidMcDays = isIntern ? 0 : (rawPaidDays > 0 ? rawPaidDays : totalDays);
  const unpaidMcDays = isIntern ? totalDays : totalDays - paidMcDays;
  const isPartiallyPaid = !isIntern && unpaidMcDays > 0;

  // Interns (own view): no MC balance at all. Their sick leave is unpaid and comes out of the
  // 14 No Pay Leave days a year, so the page shows that instead of an MC balance of 0.
  const internView = isIntern && viewAs !== "admin" && !!currentEmployeeId;
  const [internNpl, internSick] = internView
    ? await Promise.all([getNplStatus(currentEmployeeId!, profile), getInternSickRequests(currentEmployeeId!)])
    : [null, []];
  const year = new Date().getFullYear();
  const internSickTaken = internSick
    .filter((r) => r.status === "APPROVED" && r.startDate.getUTCFullYear() === year)
    .reduce((s, r) => s + Number(r.days), 0);

  const [balance, mcRequests] = await Promise.all([
    mcType && currentEmployeeId
      ? getMcBalance(currentEmployeeId, mcType.id, profile)
      : Promise.resolve({ entitlement: 0, earned: 0, used: 0, pending: 0, remaining: 0 }),
    mcType
      ? getMcRequests(mcType.id, filterByEmployeeId)
      : Promise.resolve([]),
  ]);

  // An intern's own list also carries the sick leave filed as No Pay Leave.
  const requests = internView ? [...internSick, ...mcRequests] : mcRequests;

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
                ? `Interns have no paid MC balance. Sick leave is unpaid: up to ${NPL_ANNUAL_CAP_DAYS} days a year, taken as No Pay Leave`
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
              <span className="text-xs text-gray-500 allow-wrap">
                No paid MC balance. Request MC as usual: it is submitted as No Pay Leave with your certificate, and counts
                toward your {NPL_ANNUAL_CAP_DAYS} unpaid days a year.
              </span>
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

      {/* Interns: no MC balance. Show the unpaid allowance instead. */}
      {internView && internNpl && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-400 mb-1">Paid MC Balance</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-400">None</p>
            <p className="text-xs text-gray-500 mt-1">Interns have no paid MC</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-400 mb-1">Unpaid MC Allowed</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-400">{internNpl.cap}</p>
            <p className="text-xs text-gray-500 mt-1">days a year, as No Pay Leave</p>
          </div>
          <BalanceCard label="Unpaid MC Taken" value={internSickTaken} color="text-amber-400" />
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-400 mb-1">Unpaid Days Left</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-400">{internNpl.remaining}</p>
            <p className="text-xs text-gray-500 mt-1">of {internNpl.cap}, shared with other No Pay Leave</p>
          </div>
        </div>
      )}

      {/* Balance Summary - staff view only */}
      {viewAs !== "admin" && !internView && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-400 mb-1">Earned to Date (prorated)</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-400">{balance.earned}</p>
            <p className="text-xs text-gray-500 mt-1">
              of {balance.entitlement} days/year × completed months ÷ 12, rounded down
              {isPartiallyPaid ? ` · ${paidMcDays} paid · ${unpaidMcDays} unpaid` : ""}
            </p>
          </div>
          <BalanceCard label="MC Taken" value={balance.used} color="text-amber-400" />
          <BalanceCard label="Pending" value={balance.pending} color="text-purple-400" />
          <BalanceCard
            label="MC Balance (prorated)"
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
