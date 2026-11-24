import { prisma } from "@/lib/prisma";
import { getPaidBackDays } from "@/lib/npl-payback-store";
import { isInternRoles, isMedicalLeaveCode, isPartTimeEmployment, nplAnnualCap, nplStatus, NPL_CODE, type NplStatus } from "@/lib/leave-policy";

/** The employee fields every leave-policy check needs. */
export interface LeaveProfile {
  startDate: Date | null;
  endDate: Date | null;
  monthlyLeaveRate: number | null;
  isIntern: boolean;
  /** Part-time staff: no AL, MC or No Pay Leave. */
  isPartTime?: boolean;
}

export async function getLeaveProfile(employeeId: string): Promise<LeaveProfile | null> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { startDate: true, endDate: true, monthlyLeaveRate: true, employmentType: true, user: { select: { roles: true } } },
  });
  if (!e) return null;
  return {
    startDate: e.startDate,
    endDate: e.endDate,
    monthlyLeaveRate: e.monthlyLeaveRate != null ? Number(e.monthlyLeaveRate) : null,
    isIntern: isInternRoles(e.user?.roles),
    isPartTime: isPartTimeEmployment(e.employmentType),
  };
}

/**
 * Yearly entitlement for a balance row created on demand: the person's own figure from the year
 * before (e.g. Femina and Amanda keep 7 AL a year), else the leave type's default — interns use
 * internDefaultDays when set (AL: 3), staff defaultDays (AL: 7). Part-time staff: 0 AL, MC, NPL.
 */
export async function newBalanceEntitlement(
  employeeId: string,
  leaveType: { id: string; code: string; defaultDays: number; internDefaultDays: number },
  year: number,
  profile: Pick<LeaveProfile, "isIntern" | "isPartTime"> | null | undefined,
): Promise<number> {
  if (profile?.isPartTime && (leaveType.code === "AL" || leaveType.code === NPL_CODE || isMedicalLeaveCode(leaveType.code))) return 0;
  const isIntern = !!profile?.isIntern;
  const prev = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: leaveType.id, year: year - 1 } },
    select: { entitlement: true, periodStart: true },
  });
  if (prev && !prev.periodStart) return Number(prev.entitlement);
  return isIntern && leaveType.internDefaultDays > 0 ? leaveType.internDefaultDays : leaveType.defaultDays;
}

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/**
 * No Pay Leave taken (approved) and pending this year, summed from the requests
 * themselves rather than the LeaveBalance row, which reset flows can leave stale.
 * `excludeRequestId` drops a request being edited from the total.
 * Days paid back by working an off day (approved payback) are taken off `used`.
 */
export async function getNplUsage(
  employeeId: string,
  year: number = new Date().getFullYear(),
  excludeRequestId?: string,
): Promise<{ used: number; pending: number; paidBack: number }> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      leaveType: { code: NPL_CODE },
      status: { in: ["APPROVED", "PENDING"] },
      startDate: yearRange(year),
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
    select: { days: true, status: true },
  });
  let used = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.status === "APPROVED") used += Number(r.days);
    else pending += Number(r.days);
  }
  const paidBack = Math.min(used, await getPaidBackDays(employeeId, year, excludeRequestId));
  return { used: used - paidBack, pending, paidBack };
}

/** The yearly NPL cap (flat 14, not prorated; 0 for part-time staff) and what is left of it this year. */
export async function getNplStatus(
  employeeId: string,
  profile?: LeaveProfile | null,
  asOf: Date = new Date(),
  excludeRequestId?: string,
): Promise<NplStatus> {
  const p = profile ?? await getLeaveProfile(employeeId);
  const cap = nplAnnualCap(p?.isPartTime);
  const { used, pending, paidBack } = await getNplUsage(employeeId, asOf.getFullYear(), excludeRequestId);
  return nplStatus(cap, used, pending, paidBack);
}
