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
  /** ISO datetime of the last successful fire — guards against re-firing the same run. */
  lastFiredAt: string | null;
}

const KEY = "WOODS_SQUARE_SCHEDULE";

const DEFAULT: ScheduleConfig = {
  enabled: false,
  testMode: true,
  testRecipientIds: [],
  testFireAt: null,
  lastFiredAt: null,
};

export async function getScheduleConfig(): Promise<ScheduleConfig> {
  const row = await prisma.companyCredential.findUnique({ where: { keyName: KEY } });
  if (!row) return { ...DEFAULT };
  try {
    // Back-compat: an older saved blob stored a single `testRecipientId`; fold it into
    // the new `testRecipientIds` array so existing configs keep working.
    const parsed = JSON.parse(row.keyValue) as Partial<ScheduleConfig> & { testRecipientId?: string | null };
    const { testRecipientId, ...rest } = parsed;
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
