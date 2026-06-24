import { prisma } from "@/lib/prisma";

/**
 * Monthly auto-invite scheduler config. Stored as a single JSON blob in the existing
 * CompanyCredential key/value table (so no schema change is needed) and read/written
 * through this typed wrapper.
 *
 * Production: on the last Monday of each month at noon, the cron sends the UPCOMING
 * month's invites (split into ≤7-day windows) to the whole roster. Test mode runs the
 * EXACT same upcoming-month logic, but only to `testRecipientId`, fired once `testFireAt`
 * passes — so it mirrors the live run end-to-end without touching everyone.
 */
export interface ScheduleConfig {
  /** Master on/off — when false the cron does nothing. */
  enabled: boolean;
  /** When true, the run targets only `testRecipientIds` (not the whole roster). */
  testMode: boolean;
  /** The staff a test run goes to. Two or more exercises the bulk CSV import path. */
  testRecipientIds: string[];
  /** ISO datetime — the test run fires once the current time passes this. */
  testFireAt: string | null;
  /** ISO datetime of the last SUCCESSFUL PRODUCTION run (the last-Monday monthly send).
   *  Stamped only when a run completes with no failures; guards the once-per-day fire so a
   *  failed run isn't treated as done and gets retried. Kept SEPARATE from the test
   *  watermark so a same-day test can't make production think it already ran. */
  lastProdFiredAt: string | null;
  /** ISO datetime of the last SUCCESSFUL TEST run — guards "test already fired". Separate
   *  from the production watermark for the same reason (the two cadences are independent). */
  lastTestFiredAt: string | null;
  /** ISO datetime of the last ATTEMPT (success or failure). Throttles retries after a
   *  failure so a transient Habitap outage is retried without hammering it every minute. */
  lastAttemptAt: string | null;
  /** ISO datetime admins were last notified of a failed run — so the alert fires at most
   *  once per day, not on every retry. Cleared on the next successful run. */
  failureNotifiedAt: string | null;
  /** SGT month key ("yyyy-MM") admins were last nudged that the month's real send never
   *  happened (scheduler enabled but stuck in test mode, or the run was missed). Throttles
   *  that nudge to once per month so it isn't repeated every tick. */
  missedNotifiedMonth: string | null;
}

const KEY = "WOODS_SQUARE_SCHEDULE";

const DEFAULT: ScheduleConfig = {
  enabled: false,
  testMode: true,
  testRecipientIds: [],
  testFireAt: null,
  lastProdFiredAt: null,
  lastTestFiredAt: null,
  lastAttemptAt: null,
  failureNotifiedAt: null,
  missedNotifiedMonth: null,
};

export async function getScheduleConfig(): Promise<ScheduleConfig> {
  const row = await prisma.companyCredential.findUnique({ where: { keyName: KEY } });
  if (!row) return { ...DEFAULT };
  try {
    // Back-compat: an older saved blob stored a single `testRecipientId`; fold it into
    // the new `testRecipientIds` array so existing configs keep working. Likewise an older
    // blob had one shared `lastFiredAt` — we can't know whether it was a test or production
    // fire, so drop it (worst case the next run re-fires, which dedup makes harmless) and
    // let the new split watermarks start clean.
    const parsed = JSON.parse(row.keyValue) as Partial<ScheduleConfig> & {
      testRecipientId?: string | null;
      lastFiredAt?: string | null;
    };
    const { testRecipientId, lastFiredAt: _legacyLastFiredAt, ...rest } = parsed;
    const testRecipientIds = rest.testRecipientIds ?? (testRecipientId ? [testRecipientId] : []);
    return { ...DEFAULT, ...rest, testRecipientIds };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveScheduleConfig(patch: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
  const next = { ...(await getScheduleConfig()), ...patch };
  await prisma.companyCredential.upsert({
    where: { keyName: KEY },
    create: { keyName: KEY, keyValue: JSON.stringify(next) },
    update: { keyValue: JSON.stringify(next) },
  });
  return next;
}
