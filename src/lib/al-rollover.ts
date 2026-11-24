/**
 * Annual leave year-end reset (Alfred, 24 Nov 2026):
 *  - AL resets on 1 January: the new year's balance starts from 0 and accrues by completed
 *    months (entitlement × months / 12, rounded down to a whole day — src/lib/leave-policy.ts).
 *  - Unused AL carries forward for ONE year only. What carries into year N+1 is the unused part
 *    of year N's own prorated entitlement; days carried into year N are used first and lapse if
 *    still unused on 1 January. `LeaveType.maxCarryOver` (> 0) caps the carry.
 *
 * Runs automatically every day in January from the 08:30 SGT roll-up cron
 * (/api/cron/missed-clock-out?mode=rollup), so a December request approved in early January
 * still corrects the carry. Idempotent: the new year's `carriedOver` is always recomputed from
 * the closed year, never added to. Admins can also run it from POST /api/leave/rollover.
 */
import { prisma } from "./prisma";
import { computeAlFullEntitlement } from "./utils";
import { DEMO_EMPLOYEE_CODES } from "./demo-accounts";

/** Pure: days carried into the next year. Carried-in days are consumed first; pending counts as used. */
export function alCarryForward(input: {
  /** Prorated AL earned over the whole closed year. */
  earned: number;
  used: number;
  pending: number;
  /** Days carried into the closed year (from the year before) — these lapse. */
  carriedOver: number;
  /** LeaveType.maxCarryOver; 0 = no cap. */
  maxCarry?: number;
}): number {
  const ownUsed = Math.max(0, input.used + input.pending - input.carriedOver);
  const unused = Math.max(0, input.earned - ownUsed);
  return input.maxCarry && input.maxCarry > 0 ? Math.min(unused, input.maxCarry) : unused;
}

export interface AlRolloverRow {
  employeeId: string;
  name: string;
  earned: number;
  used: number;
  pending: number;
  lapsed: number;
  carried: number;
}

/** Roll AL from `fromYear` into `fromYear + 1` for every active employee. */
export async function rollOverAnnualLeave(fromYear: number, opts: { apply: boolean }) {
  const toYear = fromYear + 1;
  const al = await prisma.leaveType.findUnique({ where: { code: "AL" } });
  if (!al) return { fromYear, toYear, apply: opts.apply, rows: [] as AlRolloverRow[] };

  const balances = await prisma.leaveBalance.findMany({
    where: { leaveTypeId: al.id, year: fromYear, periodStart: null,
      employee: { status: "ACTIVE", employeeId: { notIn: DEMO_EMPLOYEE_CODES } } },
    include: { employee: { select: { id: true, employeeId: true, name: true, startDate: true, endDate: true, monthlyLeaveRate: true } } },
  });

  const rows: AlRolloverRow[] = [];
  for (const b of balances) {
    const e = b.employee;
    const entitlement = Number(b.entitlement);
    const earned = computeAlFullEntitlement(e.startDate, e.monthlyLeaveRate != null ? Number(e.monthlyLeaveRate) : null,
      entitlement, e.endDate, fromYear);
    const used = Number(b.used);
    const pending = Number(b.pending);
    const carriedIn = Number(b.carriedOver);
    const carried = al.carryOver ? alCarryForward({ earned, used, pending, carriedOver: carriedIn, maxCarry: al.maxCarryOver }) : 0;
    const lapsed = Math.max(0, carriedIn - Math.min(carriedIn, used + pending));
    rows.push({ employeeId: e.employeeId, name: e.name, earned, used, pending, lapsed, carried });

    if (opts.apply) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: al.id, year: toYear } },
        // Keep the person's own yearly entitlement (e.g. 7) for the new year.
        create: { employeeId: e.id, leaveTypeId: al.id, year: toYear, entitlement, used: 0, pending: 0, carriedOver: carried },
        update: { carriedOver: carried },
      });
    }
  }
  return { fromYear, toYear, apply: opts.apply, rows };
}

/** Cron hook: in January, roll last year's AL into this year. A no-op the rest of the year. */
export async function januaryAlRollover(now: Date = new Date()) {
  // Decide the month on the Singapore date.
  const sg = new Date(now.getTime() + 8 * 3600_000);
  if (sg.getUTCMonth() !== 0) return { alRollover: "skipped (not January)" };
  const r = await rollOverAnnualLeave(sg.getUTCFullYear() - 1, { apply: true });
  return { alRollover: `${r.fromYear}→${r.toYear}`, alRolledEmployees: r.rows.length, alCarriedDays: r.rows.reduce((t, x) => t + x.carried, 0) };
}
