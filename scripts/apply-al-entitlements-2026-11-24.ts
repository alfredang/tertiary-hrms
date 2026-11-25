/**
 * AL entitlements (Alfred, 24 Nov 2026): staff 7 days a year, interns 3, Femina Jasmin (I0004)
 * and Amanda Halim (I0002) 7, Jyoti Chopra (E0005) 18, Tan Woei Ming (E0010),
 * Ang See Siang (E0014), Deepa Arumugam (E10001) and Choy Woon Chao / Danny (E10000) 12. Everyone on a calendar-year balance that resets on 1 January
 * (Femina's and Amanda's contract-period pools become ordinary 2026 balances).
 * Proration (whole days, completed months) is computed by the app; this only sets the yearly days.
 * Dry run by default:  npx tsx scripts/apply-al-entitlements-2026-11-24.ts [--apply]
 * Keeps used / pending / carried-over days and request history. Writes an AuditLog row per change.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const STAFF_DAYS = 7;
const INTERN_DAYS = 3;
// Own yearly days: Amanda, Femina 7; Alfred Ang, Tan Soik Ching, Jyoti Chopra 18; Tan Woei Ming,
// Ang See Siang, Deepa Arumugam, Choy Woon Chao (Danny) 12. Part-time staff: 0.
const OWN_DAYS: Record<string, number> = { I0002: 7, I0004: 7, E0001: 18, E0002: 18, E0005: 18, E0010: 12, E0014: 12, E10001: 12, E10000: 12 };

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { annualLeaveAmounts } = await import("../src/lib/annual-leave-policy");
  const { isInternRoles } = await import("../src/lib/leave-policy");
  const apply = process.argv.includes("--apply");
  const year = new Date().getFullYear();
  const al = await prisma.leaveType.findUniqueOrThrow({ where: { code: "AL" } });

  console.log(`AL type: defaultDays ${al.defaultDays} → ${STAFF_DAYS}, internDefaultDays ${al.internDefaultDays} → ${INTERN_DAYS}`);
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, employeeId: true, name: true, startDate: true, endDate: true, monthlyLeaveRate: true, employmentType: true, user: { select: { roles: true } },
      leaveBalances: { where: { leaveTypeId: al.id, OR: [{ year }, { periodStart: { not: null } }] } } },
    orderBy: { employeeId: "asc" },
  });

  const rows: string[] = [];
  for (const e of employees) {
    const intern = isInternRoles(e.user?.roles);
    const days = e.employmentType === "PART_TIME" ? 0 : OWN_DAYS[e.employeeId] ?? (intern ? INTERN_DAYS : STAFF_DAYS);
    const b = e.leaveBalances[0];
    const profile = { startDate: e.startDate, endDate: e.endDate, monthlyLeaveRate: e.monthlyLeaveRate != null ? Number(e.monthlyLeaveRate) : null };
    const amt = (ent: number, contract: boolean) => b ? annualLeaveAmounts({ entitlement: ent, used: Number(b.used), pending: Number(b.pending),
      carriedOver: Number(b.carriedOver), recordedEarned: Number(b.earned),
      periodStart: contract ? b.periodStart : null, periodEnd: contract ? b.periodEnd : null }, profile) : null;
    const before = b ? amt(Number(b.entitlement), !!b.periodStart) : null;
    const after = amt(days, false);
    rows.push(`${`${e.name} (${e.employeeId})`.padEnd(36)} ${intern ? "intern" : "staff "} ${String(b ? Number(b.entitlement) : "-").padStart(3)}${b?.periodStart ? "c" : " "}→${String(days).padStart(3)}  ` +
      `earned ${before?.earned ?? "-"}→${after?.earned ?? "-"}  used ${b ? Number(b.used) : 0}  left ${before?.remaining ?? "-"}→${after?.remaining ?? "-"}`);
    if (!apply) continue;
    if (b) {
      if (Number(b.entitlement) !== days || b.periodStart || b.periodEnd) {
        await prisma.leaveBalance.update({ where: { id: b.id }, data: { entitlement: days, periodStart: null, periodEnd: null, year } });
        await prisma.auditLog.create({ data: { action: "AL_ENTITLEMENT_SET", entity: "LeaveBalance", entityId: b.id,
          oldValue: { entitlement: Number(b.entitlement), periodStart: b.periodStart?.toISOString() ?? null, periodEnd: b.periodEnd?.toISOString() ?? null, year: b.year },
          newValue: { entitlement: days, periodStart: null, periodEnd: null, year,
            reason: "Alfred 24 Nov 2026: staff 7, interns 3, Femina/Amanda 7, Jyoti 18, Tan Woei Ming/Ang See Siang/Deepa/Danny 12 AL a year; prorated, resets 1 Jan" } } });
      }
    } else {
      await prisma.leaveBalance.create({ data: { employeeId: e.id, leaveTypeId: al.id, year, entitlement: days, used: 0, pending: 0, carriedOver: 0 } });
    }
  }
  console.log(rows.join("\n"));
  if (apply) {
    await prisma.leaveType.update({ where: { id: al.id }, data: { defaultDays: STAFF_DAYS, internDefaultDays: INTERN_DAYS } });
    console.log("APPLIED");
  } else console.log("DRY RUN — add --apply to save");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
