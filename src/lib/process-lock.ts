import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Cross-instance mutex backed by the `ProcessLock` table.
 *
 * Acquisition is a single atomic `INSERT … ON CONFLICT`: insert the lock if absent,
 * or take it over only if the current holder's TTL has lapsed. A live lock makes the
 * UPDATE a no-op (its WHERE is false), so `RETURNING` yields no row — meaning "not
 * acquired" — without any thrown error to spam the logs on a contended send. The TTL
 * lets a crashed holder's lock be reclaimed instead of wedging the key forever.
 */

/** Try to claim `key` for `ttlMs`. Returns a holder token on success, or null if held. */
export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const holder = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const rows = await prisma.$queryRaw<{ holder: string }[]>`
    INSERT INTO "ProcessLock" ("key", "holder", "acquiredAt", "expiresAt")
    VALUES (${key}, ${holder}, ${now}, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
      SET "holder" = EXCLUDED."holder",
          "acquiredAt" = EXCLUDED."acquiredAt",
          "expiresAt" = EXCLUDED."expiresAt"
      WHERE "ProcessLock"."expiresAt" < ${now}
    RETURNING "holder"
  `;
  return rows.length > 0 ? holder : null;
}

/** Release `key`, but only if we still hold it (guards against reclaiming a lock
 *  another instance took over after our TTL lapsed). Best-effort: never throws, so
 *  a transient DB error during cleanup can't mask a completed send — a lock left
 *  behind is reclaimed automatically once its TTL lapses. */
export async function releaseLock(key: string, holder: string): Promise<void> {
  try {
    await prisma.processLock.deleteMany({ where: { key, holder } });
  } catch {
    // Swallow — the TTL guarantees the lock is reclaimable even if this fails.
  }
}

/**
 * Runs `fn` while holding `key`, always releasing afterwards. Returns
 * `{ ran: false }` without calling `fn` when the lock is already held, or
 * `{ ran: true, result }` once `fn` completes. Encapsulating acquire/release here
 * means a caller can't leak the lock by forgetting to release it. If `fn` throws,
 * the lock is still released and the error propagates.
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const holder = await acquireLock(key, ttlMs);
  if (!holder) return { ran: false };
  try {
    return { ran: true, result: await fn() };
  } finally {
    await releaseLock(key, holder);
  }
}
