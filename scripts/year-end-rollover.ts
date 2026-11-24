/**
 * AL year-end rollover from the command line — same code as the January cron
 * (src/lib/al-rollover.ts): carry forward one year only, from the year's own prorated AL.
 *   npx tsx scripts/year-end-rollover.ts [--year 2026] [--dry-run]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  const { rollOverAnnualLeave } = await import("../src/lib/al-rollover");
  const { prisma } = await import("../src/lib/prisma");
  const dryRun = process.argv.includes("--dry-run");
  const i = process.argv.indexOf("--year");
  const fromYear = i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : new Date().getFullYear() - 1;
  const r = await rollOverAnnualLeave(fromYear, { apply: !dryRun });
  console.log(`AL rollover ${r.fromYear} → ${r.toYear} (${dryRun ? "DRY RUN" : "APPLIED"})`);
  console.log(`${"Employee".padEnd(34)} earned  used  pend  lapsed  carried`);
  for (const x of r.rows) {
    console.log(`${`${x.name} (${x.employeeId})`.padEnd(34)} ${String(x.earned).padStart(6)} ${String(x.used).padStart(5)} ${String(x.pending).padStart(5)} ${String(x.lapsed).padStart(7)} ${String(x.carried).padStart(8)}`);
  }
  console.log(`Total carried: ${r.rows.reduce((t, x) => t + x.carried, 0)}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
