/**
 * Opt individual interns into one fixed AL pool for their recorded contract.
 * Dry-run by default. Example:
 *   npx tsx scripts/configure-internship-leave.ts --employee-id <id> --days 7 [--apply]
 * Apply prisma/changes/2026-11-13-internship-leave.sql before using the new fields.
 * Preserves used/pending days, request history, MC and Off In Lieu.
 * Only adds the original balance year to existing AL requests for future accounting.
 */
import { config } from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { annualLeaveAmounts } from "../src/lib/annual-leave-policy";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const ids = args.flatMap((a, i) => a === "--employee-id" && args[i + 1] ? [args[i + 1]] : []);
const days = Number(args[args.indexOf("--days") + 1]);
const apply = args.includes("--apply");

async function main() {
  if (!ids.length || !args.includes("--days") || !Number.isFinite(days) || days <= 0 || days % 0.5 !== 0) {
    throw new Error("Specify --employee-id <id> (repeatable) and --days <positive half-day total>; add --apply to save.");
  }
  const results = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const id of [...new Set(ids)]) {
      const e = await tx.employee.findUnique({ where: { id }, select: {
        name: true, startDate: true, endDate: true, employmentType: true,
      } });
      if (!e || e.employmentType !== "INTERN" || !e.startDate || !e.endDate || e.endDate < e.startDate) {
        throw new Error("A valid intern with recorded start/end dates is required: " + id);
      }
      const year = e.startDate.getUTCFullYear();
      const balances = await tx.leaveBalance.findMany({ where: { employeeId: id, leaveType: { code: "AL" } } });
      const balance = balances.find((b) => b.year === year);
      if (!balance || balances.length !== 1) {
        throw new Error("Exactly one original AL ledger is required; additional years need manual reconciliation: " + id);
      }
      if (Number(balance.carriedOver) !== 0) throw new Error("Reconcile carried-over days before configuring a fixed contract pool: " + id);
      const amounts = annualLeaveAmounts({ entitlement: days, used: Number(balance.used), pending: Number(balance.pending), carriedOver: 0,
        recordedEarned: Number(balance.earned), periodStart: e.startDate, periodEnd: e.endDate });
      if (apply) {
        await tx.leaveBalance.update({ where: { id: balance.id }, data: {
          entitlement: new Prisma.Decimal(days), periodStart: e.startDate, periodEnd: e.endDate,
        } });
        // Existing requests must continue to update this same pool after New Year.
        const requests = await tx.leaveRequest.findMany({ where: { employeeId: id, leaveTypeId: balance.leaveTypeId }, select: { id: true, balanceYear: true } });
        await tx.leaveRequest.updateMany({ where: { employeeId: id, leaveTypeId: balance.leaveTypeId }, data: { balanceYear: year } });
        await tx.auditLog.create({ data: { action: "INTERNSHIP_AL_CONFIGURED", entity: "LeaveBalance", entityId: balance.id,
          oldValue: { balance: JSON.parse(JSON.stringify(balance)), requestLedgers: requests },
          newValue: { entitlement: days, periodStart: e.startDate.toISOString(), periodEnd: e.endDate.toISOString(), balanceYear: year,
            reason: "User-confirmed fixed internship entitlement; preserve existing usage and pending requests" } } });
      }
      results.push({ name: e.name, apply, total: days, start: e.startDate.toISOString().slice(0, 10), end: e.endDate.toISOString().slice(0, 10),
        earned: amounts.earned, used: Number(balance.used), pending: Number(balance.pending), remaining: amounts.remaining,
        advance: Math.max(0, amounts.fullAvailable - Math.max(0, amounts.remaining)),
        overTotal: Math.max(0, Number(balance.used) + Number(balance.pending) - days) });
    }
    return results;
  }, { isolationLevel: "Serializable", timeout: 15000 });
  console.log(JSON.stringify(results, null, 2));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
