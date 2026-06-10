/**
 * Local smoke test for the cross-instance send lock (#4).
 * Run: npx tsx scripts/smoke-process-lock.ts
 * Requires the ProcessLock table to exist locally (npm run db:push first).
 *
 * Simulates two server instances racing on the same key and asserts the lock
 * behaves: only one holder at a time, release frees it, stale locks reclaim.
 */
import { acquireLock, releaseLock } from "../src/lib/process-lock";
import { prisma } from "../src/lib/prisma";

const KEY = "smoke-test-lock";
let failures = 0;

function check(label: string, ok: boolean) {
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failures++;
}

async function main() {
  // Clean slate in case a previous run left the row behind.
  await prisma.processLock.deleteMany({ where: { key: KEY } });

  // 1. First caller acquires.
  const a = await acquireLock(KEY, 60_000);
  check("first acquire returns a holder token", typeof a === "string" && a.length > 0);

  // 2. Second caller (another "instance") is blocked while it's held.
  const b = await acquireLock(KEY, 60_000);
  check("concurrent acquire is rejected (returns null)", b === null);

  // 3. After the holder releases, it can be acquired again.
  await releaseLock(KEY, a!);
  const c = await acquireLock(KEY, 60_000);
  check("acquire succeeds again after release", typeof c === "string");

  // 4. A non-holder cannot release someone else's lock.
  await releaseLock(KEY, "not-the-holder");
  const d = await acquireLock(KEY, 60_000);
  check("release by a non-holder does not free the lock", d === null);

  // 5. A stale (expired-TTL) lock is reclaimable. Acquire with a 0ms TTL so it is
  //    immediately expired, then a fresh acquire should reclaim it.
  await prisma.processLock.deleteMany({ where: { key: KEY } });
  await acquireLock(KEY, 0);
  const e = await acquireLock(KEY, 60_000);
  check("expired (stale) lock is reclaimed by a new caller", typeof e === "string");

  // Cleanup.
  await prisma.processLock.deleteMany({ where: { key: KEY } });
  console.log(failures === 0 ? "\nAll lock checks passed." : `\n${failures} check(s) FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("Smoke test errored:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
