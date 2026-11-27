// Annual leave in place of No Pay Leave (Femina, 27 Nov 2026). Someone whose annual leave ran
// out takes the rest as No Pay Leave; once more annual leave is earned (prorated, monthly) they
// can ask to use it for one of those No Pay Leave days instead. It is an ordinary annual leave
// request for that day, submitted with `coversNpl` and approved like any other (the AL approval
// guard still applies). Only when it is approved is the day taken out of the No Pay Leave request,
// so a rejected or cancelled request leaves the No Pay Leave exactly as it was.
import { prisma } from "@/lib/prisma";
import { NPL_CODE } from "@/lib/leave-policy";
import { nplDaysOfRequest, nplPiecesAfterRemoving, dateOnly, ymd } from "@/lib/npl-payback";
import { holidayKeys } from "@/lib/npl-payback-store";

/** Leave that may stand in for No Pay Leave days: annual leave and Off In Lieu. */
export const REPLACES_NPL_CODES = ["AL", "AL_OT"];

export const AL_FOR_NPL_REASON = (date: string) => `Annual leave in place of No Pay Leave on ${date}`;

/** Every calendar day from start to end, as YYYY-MM-DD. */
function datesBetween(start: Date, end: Date): Set<string> {
  const out = new Set<string>();
  for (let d = dateOnly(ymd(start)), i = 0; d <= dateOnly(ymd(end)) && i < 400; d = new Date(d.getTime() + 86_400_000), i++) {
    out.add(ymd(d));
  }
  return out;
}

type Db = Pick<typeof prisma, "leaveRequest" | "calendarEvent" | "nplPayback" | "auditLog">;

/**
 * After an annual leave or Off In Lieu request is approved: take its days out of any approved No
 * Pay Leave on the same dates (only these two types may overlap one, see POST /api/leave; for any
 * other leave this does nothing). Splits the No Pay Leave around the days, moving its
 * paybacks and calendar entry with each piece, and records it in the audit log. Returns the days
 * released.
 */
export async function releaseNplCoveredByAl(
  al: { id: string; employeeId: string; startDate: Date; endDate: Date; leaveType: { code: string } },
  db: Db = prisma,
): Promise<number> {
  if (!REPLACES_NPL_CODES.includes(al.leaveType.code)) return 0;
  const npls = await db.leaveRequest.findMany({
    where: {
      employeeId: al.employeeId,
      status: "APPROVED",
      leaveType: { code: NPL_CODE },
      startDate: { lte: al.endDate },
      endDate: { gte: al.startDate },
    },
  });
  if (npls.length === 0) return 0;
  const events = await db.calendarEvent.findMany({ where: { leaveRequestId: { in: npls.map((n) => n.id) } } });
  const eventOf = new Map(events.map((e) => [e.leaveRequestId, e]));

  const remove = datesBetween(al.startDate, al.endDate);
  const years = Array.from(new Set(npls.flatMap((n) => [n.startDate.getUTCFullYear(), n.endDate.getUTCFullYear()])));
  const holidays = await holidayKeys(years);
  let released = 0;

  for (const npl of npls) {
    const days = nplDaysOfRequest({ startDate: npl.startDate, endDate: npl.endDate, days: Number(npl.days) }, holidays);
    const pieces = nplPiecesAfterRemoving(days, remove);
    if (!pieces) continue;
    released += days.filter((d) => remove.has(d.date)).reduce((s, d) => s + d.days, 0);

    // Paybacks on a released day have nothing left to pay back.
    await db.nplPayback.updateMany({
      where: { leaveRequestId: npl.id, status: { in: ["PENDING", "APPROVED"] }, nplDate: { in: Array.from(remove).map(dateOnly) } },
      data: { status: "CANCELLED", note: "Cancelled: this No Pay Leave day was replaced by annual leave" },
    });

    const newIds: string[] = [];
    if (pieces.length === 0) {
      await db.leaveRequest.update({ where: { id: npl.id }, data: { status: "CANCELLED" } });
      await db.calendarEvent.deleteMany({ where: { leaveRequestId: npl.id } });
    } else {
      const [first, ...rest] = pieces;
      await db.leaveRequest.update({
        where: { id: npl.id },
        data: { startDate: dateOnly(first.startDate), endDate: dateOnly(first.endDate), days: first.days },
      });
      await db.calendarEvent.updateMany({
        where: { leaveRequestId: npl.id },
        data: { startDate: dateOnly(first.startDate), endDate: dateOnly(first.endDate) },
      });
      for (const piece of rest) {
        const id = `lr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        newIds.push(id);
        await db.leaveRequest.create({
          data: {
            id,
            employeeId: npl.employeeId,
            leaveTypeId: npl.leaveTypeId,
            startDate: dateOnly(piece.startDate),
            endDate: dateOnly(piece.endDate),
            days: piece.days,
            dayType: "FULL_DAY",
            reason: npl.reason,
            status: "APPROVED",
            approverId: npl.approverId,
            approvedAt: npl.approvedAt,
            approvalComment: npl.approvalComment,
            otDaysUsed: 0,
            deficitDays: 0,
            createdAt: npl.createdAt,
          },
        });
        const event = eventOf.get(npl.id);
        if (event) {
          await db.calendarEvent.create({
            data: {
              title: event.title,
              description: event.description,
              startDate: dateOnly(piece.startDate),
              endDate: dateOnly(piece.endDate),
              allDay: true,
              type: event.type,
              color: event.color,
              leaveRequestId: id,
            },
          });
        }
        await db.nplPayback.updateMany({
          where: { leaveRequestId: npl.id, nplDate: { gte: dateOnly(piece.startDate), lte: dateOnly(piece.endDate) } },
          data: { leaveRequestId: id },
        });
      }
    }

    await db.auditLog.create({
      data: {
        action: "NPL_REPLACED_BY_AL",
        entity: "LeaveRequest",
        entityId: npl.id,
        oldValue: { startDate: ymd(npl.startDate), endDate: ymd(npl.endDate), days: Number(npl.days) },
        newValue: { annualLeaveRequestId: al.id, releasedDates: days.filter((d) => remove.has(d.date)).map((d) => d.date), pieces: pieces.map((p) => ({ ...p })), newRequestIds: newIds },
      },
    });
  }
  return released;
}
