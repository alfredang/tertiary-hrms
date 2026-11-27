import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RotateCcw } from "lucide-react";
import { PaybackList, type PaybackRow } from "@/components/leave/payback-list";
import { UseAlForNplButton } from "@/components/leave/use-al-for-npl-button";
import { getLeaveProfile, getNplStatus } from "@/lib/leave-allowance";
import { loadLeaveSummary } from "@/lib/approval-summaries";
import { getNplDays } from "@/lib/npl-payback-store";
import { dayCountLabel, prettyDay, ymd } from "@/lib/npl-payback";
import { NPL_ANNUAL_CAP_DAYS } from "@/lib/leave-policy";

export const dynamic = "force-dynamic";

const sgTime = (d: Date) =>
  d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" });

async function getPaybacks(employeeId: string | undefined, withPunches: boolean): Promise<PaybackRow[]> {
  const rows = await prisma.nplPayback.findMany({
    where: employeeId ? { employeeId } : {},
    include: { employee: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  // Admin view: the clock-in / clock-out on the off day worked, as evidence for the approver.
  const punches = withPunches && rows.length
    ? await prisma.attendancePunch.findMany({
        where: { OR: rows.map((r) => ({ employeeId: r.employeeId, date: r.workDate })) },
        select: { employeeId: true, date: true, clockIn: true, clockOut: true },
      })
    : [];
  const punchBy = new Map(punches.map((p) => [`${p.employeeId}|${ymd(p.date)}`, p]));
  return rows.map((r) => {
    const punch = punchBy.get(`${r.employeeId}|${ymd(r.workDate)}`);
    return {
      id: r.id,
      employeeName: r.employee.name,
      nplDate: ymd(r.nplDate),
      workDate: ymd(r.workDate),
      days: Number(r.days),
      note: r.note,
      status: r.status,
      approvalComment: r.approvalComment,
      rejectionReason: r.rejectionReason,
      appliedOn: ymd(new Date(r.createdAt.getTime() + 8 * 3600 * 1000)),
      clocked: punch?.clockIn ? `${sgTime(punch.clockIn)} – ${punch.clockOut ? sgTime(punch.clockOut) : "no clock-out"}` : null,
    };
  });
}

export default async function PaybackPage() {
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

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";
  const adminView = viewAs === "admin";

  const title = (
    <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
      <RotateCcw className="h-7 w-7 text-primary" />
      Payback
    </h1>
  );

  // Never fall through to everyone's records when a staff view has no employee record.
  if (!adminView && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        {title}
        <p className="text-sm sm:text-base text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  if (adminView) {
    const rows = await getPaybacks(undefined, true);
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return (
      <div className="space-y-6">
        <div>
          {title}
          <p className="text-sm sm:text-base text-gray-400 mt-1 allow-wrap">
            Staff and interns who worked an off day to pay back No Pay Leave. Approving gives the day back to their No Pay Leave balance.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Total Requests" value={rows.length} color="text-white" />
          <Tile label="Pending" value={count("PENDING")} color="text-amber-400" />
          <Tile label="Approved" value={count("APPROVED")} color="text-green-400" />
          <Tile label="Rejected" value={count("REJECTED")} color="text-red-400" />
        </div>
        <PaybackList rows={rows} isManager />
      </div>
    );
  }

  const employeeId = currentEmployeeId!;
  const year = new Date().getFullYear();
  const [rows, nplDays, npl, summary, profile, alType] = await Promise.all([
    getPaybacks(employeeId, false),
    getNplDays(employeeId, year),
    getNplStatus(employeeId),
    // The same figures as the dashboard tiles and the decision email.
    loadLeaveSummary(employeeId, year),
    getLeaveProfile(employeeId),
    prisma.leaveType.findUnique({ where: { code: "AL" }, select: { id: true } }),
  ]);
  // The label is "Annual leave balance (prorated)"; match its start so a wording change can't blank the tile.
  const alStat = summary?.stats.find((s) => s.label.toLowerCase().startsWith("annual leave balance"));
  const alBalance = alStat?.value ?? "-";
  const alLeft = alStat ? parseFloat(alStat.value) || 0 : 0;
  const canPayBack = nplDays.some((d) => d.outstanding > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {title}
          <p className="text-sm sm:text-base text-gray-400 mt-1 allow-wrap">
            Took No Pay Leave? Work one of your off days instead, or use annual leave you have earned since, and once approved
            that day goes back to your No Pay Leave balance.
          </p>
        </div>
        {canPayBack && (
          <Link href="/leave/payback/request" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Request Payback
            </Button>
          </Link>
        )}
      </div>

      {profile?.isIntern && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 allow-wrap">
          <strong>Interns have no paid MC balance.</strong> Sick leave is unpaid: it is taken as No Pay Leave, up to{" "}
          {NPL_ANNUAL_CAP_DAYS} days a year, and comes out of the No Pay Leave balance shown here.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Annual Leave Balance" value={alBalance} color="text-blue-400" hint={alLeft >= 1 && canPayBack ? "can replace No Pay Leave days" : undefined} />
        <Tile label="No Pay Leave Taken" value={dayCountText(npl.used)} color="text-amber-400" hint={npl.pending > 0 ? `${npl.pending} pending approval` : "after payback"} />
        <Tile label="Paid Back" value={dayCountText(npl.paidBack ?? 0)} color="text-green-400" hint="by working an off day" />
        <Tile label="No Pay Leave Balance" value={`${npl.remaining} of ${npl.cap}`} color="text-white" hint="days left this year" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">My No Pay Leave in {year}</h2>
        <div className="rounded-lg border border-gray-700 bg-gray-950 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-800">
                {["No Pay Leave day", "Days", "Reason", "Payback", ""].map((h, i) => (
                  <th key={i} className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {nplDays.map((d) => (
                <tr key={`${d.leaveRequestId}-${d.date}`} className="hover:bg-gray-900 transition-colors">
                  <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-white">{prettyDay(d.date)}</td>
                  <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300">{dayCountLabel(d.days)}</td>
                  <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 max-w-[220px] truncate" title={d.reason ?? undefined}>{d.reason || "—"}</td>
                  <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300">
                    {d.alPending ? (
                      <span className="inline-flex items-center gap-1.5">
                        Replaced by leave
                        <Badge className="bg-amber-900 text-amber-200 border-amber-800">PENDING</Badge>
                      </span>
                    ) : d.paybacks.length === 0 ? (
                      <span className="text-gray-500">Not paid back</span>
                    ) : (
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        {d.paybacks.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1.5">
                            Worked {prettyDay(p.workDate)}{p.days < d.days ? " (half day)" : ""}
                            <Badge className={p.status === "APPROVED" ? "bg-green-900 text-green-200 border-green-800" : "bg-amber-900 text-amber-200 border-amber-800"}>
                              {p.status === "APPROVED" ? "PAID BACK" : "PENDING"}
                            </Badge>
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-2 sm:px-4 py-3 text-right">
                    <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
                      {alType && alLeft >= 1 && d.days === 1 && d.outstanding >= 1 && (
                        <UseAlForNplButton date={d.date} alLeaveTypeId={alType.id} />
                      )}
                      {d.outstanding > 0 && (
                        <Button asChild size="sm" className="h-8 text-xs sm:text-sm">
                          <Link href={`/leave/payback/request?npl=${d.date}`}>Pay back</Link>
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nplDays.length === 0 && <p className="text-center py-10 text-gray-500">You have not taken any No Pay Leave this year.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">My payback requests</h2>
        <PaybackList rows={rows} isManager={false} />
      </section>
    </div>
  );
}

const dayCountText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function Tile({ label, value, color, hint }: { label: string; value: number | string; color: string; hint?: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
      <p className="text-xs sm:text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
