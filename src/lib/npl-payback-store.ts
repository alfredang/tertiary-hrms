// Database side of No Pay Leave payback (rules: src/lib/npl-payback.ts).
import { prisma } from "@/lib/prisma";
import { NPL_CODE } from "@/lib/leave-policy";
import { dateOnly, nplDaysOfRequest, paybackNoticeMessage, PAYBACK_NOTICE_TITLE, ymd, type NplDay } from "@/lib/npl-payback";
import { linkWithRequest, MAX_AGE_DAYS, missingRequestNotices } from "@/lib/notification-relevance";
import { DEMO_EMPLOYEE_CODES } from "@/lib/demo-accounts";
import { isDemoEmail } from "@/lib/demo-guard";

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/** Singapore public holidays of the given years, as YYYY-MM-DD. */
export async function holidayKeys(years: number[]): Promise<Set<string>> {
  const rows = await prisma.publicHoliday.findMany({ where: { year: { in: years }, countryCode: "SG" }, select: { date: true } });
  return new Set(rows.map((h) => ymd(h.date)));
}

export interface PaybackEntry {
  id: string;
  workDate: string;
  days: number;
  status: "PENDING" | "APPROVED";
}

export interface NplDayRow extends NplDay {
  leaveRequestId: string;
  reason: string | null;
  /** Approved and pending paybacks against this day. */
  paybacks: PaybackEntry[];
  paidBack: number;
  pending: number;
  /** Annual leave or Off In Lieu to replace this day is waiting for approval (src/lib/npl-to-al.ts). */
  alPending: boolean;
  /** Still open to a new payback request. */
  outstanding: number;
}

/**
 * Every approved No Pay Leave day of the employee in `year`, newest first, with the paybacks made
 * against it. Drives the staff page, the request form and the API validation.
 */
export async function getNplDays(employeeId: string, year: number = new Date().getFullYear()): Promise<NplDayRow[]> {
  const [requests, holidays, pendingAl] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", leaveType: { code: NPL_CODE }, startDate: yearRange(year) },
      select: {
        id: true, startDate: true, endDate: true, days: true, reason: true,
        paybacks: {
          where: { status: { in: ["PENDING", "APPROVED"] } },
          select: { id: true, nplDate: true, workDate: true, days: true, status: true },
          orderBy: { workDate: "asc" },
        },
      },
      orderBy: { startDate: "desc" },
    }),
    holidayKeys([year, year + 1]),
    // Pending annual leave / Off In Lieu on a No Pay Leave day is a replacement (src/lib/npl-to-al.ts).
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "PENDING", leaveType: { code: { in: ["AL", "AL_OT"] } }, endDate: { gte: yearRange(year).gte } },
      select: { startDate: true, endDate: true },
    }),
  ]);
  const alPendingOn = (date: string) => pendingAl.some((a) => ymd(a.startDate) <= date && date <= ymd(a.endDate));
  const rows: NplDayRow[] = [];
  for (const r of requests) {
    const days = nplDaysOfRequest({ startDate: r.startDate, endDate: r.endDate, days: Number(r.days) }, holidays);
    for (const day of days.reverse()) {
      const paybacks = r.paybacks
        .filter((p) => ymd(p.nplDate) === day.date)
        .map((p) => ({ id: p.id, workDate: ymd(p.workDate), days: Number(p.days), status: p.status as "PENDING" | "APPROVED" }));
      const paidBack = paybacks.filter((p) => p.status === "APPROVED").reduce((s, p) => s + p.days, 0);
      const pending = paybacks.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.days, 0);
      const alPending = alPendingOn(day.date);
      rows.push({
        ...day, leaveRequestId: r.id, reason: r.reason, paybacks, paidBack, pending, alPending,
        outstanding: alPending ? 0 : Math.max(0, day.days - paidBack - pending),
      });
    }
  }
  return rows;
}

/**
 * No Pay Leave days paid back (approved) in `year`, counted against leave that is still approved.
 * Returns 0 if the table is not there yet (code deployed before the SQL change), so leave pages
 * never break on it.
 */
export async function getPaidBackDays(employeeId: string, year: number, excludeLeaveRequestId?: string): Promise<number> {
  try {
    const sum = await prisma.nplPayback.aggregate({
      where: {
        employeeId,
        status: "APPROVED",
        leaveRequest: {
          status: "APPROVED",
          leaveType: { code: NPL_CODE },
          startDate: yearRange(year),
          ...(excludeLeaveRequestId ? { id: { not: excludeLeaveRequestId } } : {}),
        },
      },
      _sum: { days: true },
    });
    return Number(sum._sum.days ?? 0);
  } catch (err) {
    console.error("NPL payback total failed:", err);
    return 0;
  }
}

/** Paid-back days per employee for `year` (admin overview and alerts). Never throws. */
export async function getPaidBackDaysByEmployee(year: number): Promise<Map<string, number>> {
  try {
    const rows = await prisma.nplPayback.findMany({
      where: { status: "APPROVED", leaveRequest: { status: "APPROVED", leaveType: { code: NPL_CODE }, startDate: yearRange(year) } },
      select: { employeeId: true, days: true },
    });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.employeeId, (out.get(r.employeeId) ?? 0) + Number(r.days));
    return out;
  } catch (err) {
    console.error("NPL payback totals failed:", err);
    return new Map();
  }
}

/** Days already claimed (approved or pending) by working on `workDate`, and whether Off In Lieu was earned that day. */
export async function workDateUsage(employeeId: string, workDate: string): Promise<{ claimed: number; offInLieu: boolean }> {
  const date = dateOnly(workDate);
  const [paybacks, otLog, timesheet] = await Promise.all([
    prisma.nplPayback.findMany({ where: { employeeId, workDate: date, status: { in: ["PENDING", "APPROVED"] } }, select: { days: true } }),
    prisma.otWorkLog.findFirst({ where: { employeeId, date }, select: { id: true } }),
    prisma.timesheetEntry.findFirst({ where: { employeeId, date, otCredited: { gt: 0 } }, select: { id: true } }),
  ]);
  return { claimed: paybacks.reduce((s, p) => s + Number(p.days), 0), offInLieu: !!otLog || !!timesheet };
}

/** The client or a transaction of it: only the payback table is used. */
type Db = { nplPayback: Pick<typeof prisma.nplPayback, "updateMany"> };

/**
 * Approve or reject a pending payback. Returns false when it was no longer pending (someone else
 * decided it first), so each decision applies exactly once.
 */
export async function decidePayback(
  id: string,
  decision: "APPROVED" | "REJECTED",
  opts: { approverId?: string | null; comment?: string | null } = {},
  db: Db = prisma,
): Promise<boolean> {
  const now = new Date();
  const comment = opts.comment?.trim() || null;
  const res = await db.nplPayback.updateMany({
    where: { id, status: "PENDING" },
    data:
      decision === "APPROVED"
        ? { status: "APPROVED", approverId: opts.approverId ?? null, approvedAt: now, approvalComment: comment }
        : { status: "REJECTED", approverId: opts.approverId ?? null, rejectedAt: now, rejectionReason: comment },
  });
  return res.count > 0;
}

/**
 * Every pending payback has a notice in this approver's list (Alfred, 23 Nov 2026: two payback
 * emails arrived but only one notice). Recreates a missing PAYBACK_SUBMITTED notice, dated when
 * the request was made, so the bell and both apps can act on it. Called by GET /api/notifications
 * for approvers. Never throws.
 */
export async function ensurePaybackNotices(userId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
    const pending = await prisma.nplPayback.findMany({
      where: { status: "PENDING", createdAt: { gte: since } },
      include: { employee: { select: { name: true, employeeId: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    const real = pending.filter((p) => !DEMO_EMPLOYEE_CODES.includes(p.employee.employeeId) && !isDemoEmail(p.employee.email));
    if (real.length === 0) return 0;
    const existing = await prisma.notification.findMany({
      where: { userId, type: "PAYBACK_SUBMITTED", createdAt: { gte: since } },
      select: { link: true, message: true },
    });
    const wanted = real.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      message: paybackNoticeMessage(p.employee.name, p.workDate, p.nplDate, Number(p.days)),
    }));
    const missing = missingRequestNotices(wanted, existing);
    if (missing.length === 0) return 0;
    const r = await prisma.notification.createMany({
      data: missing.map((m) => ({
        userId,
        title: PAYBACK_NOTICE_TITLE,
        message: m.message,
        type: "PAYBACK_SUBMITTED",
        link: linkWithRequest("/leave/payback", m.id),
        createdAt: m.createdAt,
      })),
    });
    return r.count;
  } catch (err) {
    console.error("[ensurePaybackNotices]", err instanceof Error ? err.message : err);
    return 0;
  }
}
