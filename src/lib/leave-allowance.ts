import { prisma } from "@/lib/prisma";
import { isInternRoles, nplCapToDate, nplStatus, NPL_CODE, type NplStatus } from "@/lib/leave-policy";

/** The employee fields every leave-policy check needs. */
export interface LeaveProfile {
  startDate: Date | null;
  endDate: Date | null;
  monthlyLeaveRate: number | null;
  isIntern: boolean;
}

export async function getLeaveProfile(employeeId: string): Promise<LeaveProfile | null> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { startDate: true, endDate: true, monthlyLeaveRate: true, user: { select: { roles: true } } },
  });
  if (!e) return null;
  return {
    startDate: e.startDate,
    endDate: e.endDate,
    monthlyLeaveRate: e.monthlyLeaveRate != null ? Number(e.monthlyLeaveRate) : null,
    isIntern: isInternRoles(e.user?.roles),
  };
}

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/**
 * No Pay Leave taken (approved) and pending this year, summed from the requests
 * themselves rather than the LeaveBalance row, which reset flows can leave stale.
 * `excludeRequestId` drops a request being edited from the total.
 */
export async function getNplUsage(
  employeeId: string,
  year: number = new Date().getFullYear(),
  excludeRequestId?: string,
): Promise<{ used: number; pending: number }> {
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
  return { used, pending };
}

/** Prorated NPL cap and what is left of it this year. */
export async function getNplStatus(
  employeeId: string,
  profile?: LeaveProfile | null,
  asOf: Date = new Date(),
  excludeRequestId?: string,
): Promise<NplStatus> {
  const p = profile ?? (await getLeaveProfile(employeeId));
  const cap = nplCapToDate(p?.startDate, asOf, p?.endDate);
  const { used, pending } = await getNplUsage(employeeId, asOf.getFullYear(), excludeRequestId);
  return nplStatus(cap, used, pending);
}
