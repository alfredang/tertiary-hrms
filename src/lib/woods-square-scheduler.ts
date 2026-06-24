import { format, parseISO } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  FROM_TIME,
  HABITAP_DATE_FMT,
  TO_TIME,
  isAfterLastMondayOfMonth,
  isLastMondayOfMonth,
  monthWindows,
  upcomingMonthOf,
} from "@/lib/woods-square";
// Type only — the send-core (and its node-only deps: process-lock/crypto, habitap/
// playwright) is imported lazily inside runScheduledSend, so it never enters the
// instrumentation/timer static bundle (which can't webpack those).
import type { SendOutcome } from "@/lib/woods-square-send";
import { type ScheduleConfig, getScheduleConfig, saveScheduleConfig } from "@/lib/woods-square-schedule";

const isoToHabitap = (iso: string) => format(parseISO(iso), HABITAP_DATE_FMT);

/** Today's calendar date in Singapore time (the server runs in UTC). */
export function sgtToday(): Date {
  const sgt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate());
}

export interface ScheduledRunResult {
  mode: "test" | "production";
  month: string;
  recipients: number;
  windows: { window: string; outcome: SendOutcome }[];
}

/**
 * The monthly run: send the UPCOMING month's invites, split into ≤7-day windows. Each
 * window goes through the shared gap-aware send, so a person is sent only the days within
 * that window they don't already have (no prior coverage → the whole window; fully covered
 * → nothing). Production targets the whole roster; test targets `testRecipientIds`. Same
 * path as the manual admin send, so behaviour is identical everywhere.
 */
export async function runScheduledSend(opts: {
  mode: "test" | "production";
  testRecipientIds?: string[] | null;
}): Promise<ScheduledRunResult> {
  // Lazy-load the send-core here so its node-only deps stay out of the timer bundle.
  const { runWoodsSquareSendGapAware } = await import("@/lib/woods-square-send");
  const { year, monthIndex } = upcomingMonthOf(sgtToday());
  const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const windows = monthWindows(year, monthIndex);

  let staffIds: string[];
  if (opts.mode === "test") {
    staffIds = opts.testRecipientIds ?? [];
  } else {
    const roster = await prisma.employee.findMany({
      where: { woodsSquareInvite: true },
      select: { id: true },
    });
    staffIds = roster.map((e) => e.id);
  }
  if (staffIds.length === 0) {
    return { mode: opts.mode, month, recipients: 0, windows: [] };
  }

  const results: { window: string; outcome: SendOutcome }[] = [];
  for (const w of windows) {
    const outcome = await runWoodsSquareSendGapAware({
      staffIds,
      window: {
        fromDate: isoToHabitap(w.from),
        fromTime: FROM_TIME,
        toDate: isoToHabitap(w.to),
        toTime: TO_TIME,
      },
    });
    results.push({ window: `${w.from} – ${w.to}`, outcome });
  }

  return { mode: opts.mode, month, recipients: staffIds.length, windows: results };
}

/** How long to wait before re-attempting a FAILED scheduled run, so a transient Habitap
 *  outage is retried without hammering the portal every minute. Retries are naturally
 *  bounded: production only re-attempts while it's still the last Monday (until midnight
 *  SGT); a test re-attempts until it finally succeeds or the admin turns it off. */
const RETRY_BACKOFF_MS = 30 * 60_000; // 30 min

/** SGT calendar-day key (yyyy-MM-dd) for an ISO instant — matches the once-per-day guards. */
function sgtDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Did a completed run fail to deliver something it should have? True if any weekly window
 * errored outright, OR any individual invite within an otherwise-ok window failed. A run
 * where everyone was simply skipped (already covered) — or there were no recipients — is
 * NOT a failure. This is what decides whether the run is marked done or retried later.
 */
export function runHadFailure(result: ScheduledRunResult): boolean {
  return result.windows.some(
    (w) =>
      // A 409 means another send held the single-flight lock (a concurrent manual send, or
      // another app instance) — that's contention, not a failure, so don't treat it as one.
      (!w.outcome.ok && w.outcome.status !== 409) || (w.outcome.ok && w.outcome.failedCount > 0),
  );
}

/**
 * A run is "contended" when a window couldn't run because another send held the lock (409).
 * Nothing went wrong and nothing was sent — so we neither alert admins nor mark the month
 * done; the next tick simply retries once the lock frees. Guards against a second app
 * instance (or an overlapping manual send) firing a spurious "auto-invite failed" alert. (#7)
 */
function runWasContended(result: ScheduledRunResult): boolean {
  return result.windows.some((w) => !w.outcome.ok && w.outcome.status === 409);
}

/** One-line, admin-readable summary of what went wrong in a scheduled run. */
function summarizeFailure(result: ScheduledRunResult): string {
  const failedWindows = result.windows.filter((w) => !w.outcome.ok).length;
  const failedInvitees = result.windows.reduce(
    (n, w) => n + (w.outcome.ok ? w.outcome.failedCount : 0),
    0,
  );
  const bits: string[] = [];
  if (failedWindows) bits.push(`${failedWindows} of ${result.windows.length} weekly window(s) failed`);
  if (failedInvitees) bits.push(`${failedInvitees} individual invite(s) failed`);
  const what = bits.join(" and ") || "the send hit an error";
  return (
    `Next month's (${result.month}) Woods Square auto-invite ran but ${what}. ` +
    `Some staff may not have received their building PIN — open Woods Square → Settings ` +
    `and use "Run now" to retry.`
  );
}

/** Notify every admin that a scheduled run failed, so a human can step in. Best-effort. */
async function notifyScheduleFailure(message: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { roles: { hasSome: ["ADMIN", "HR", "MANAGER"] } },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: "Woods Square auto-invite failed",
      message,
      type: "WOODS_SQUARE_SEND_FAILED",
      link: "/woods-square?tab=manage",
    })),
  });
}

/**
 * Run the send, then record the outcome:
 *  - on full success: stamp the mode's watermark (`lastTestFiredAt` / `lastProdFiredAt`) so
 *    it won't re-run, and clear the failure flag;
 *  - on failure (thrown OR any window/invitee failed): DON'T stamp it, so the next tick
 *    retries after the backoff — and notify admins at most once per day.
 * `lastAttemptAt` is stamped UP FRONT so a crash or a long-but-failing run still throttles
 * the next retry instead of looping every minute.
 */
async function runAndFinalize(
  config: ScheduleConfig,
  opts: { mode: "test" | "production"; testRecipientIds?: string[] | null },
  todayKey: string,
): Promise<{ fired: boolean; detail: unknown }> {
  await saveScheduleConfig({ lastAttemptAt: new Date().toISOString() });

  const notifyOncePerDay = async (message: string) => {
    const notifiedToday =
      !!config.failureNotifiedAt && sgtDayKey(config.failureNotifiedAt) === todayKey;
    if (notifiedToday) return;
    await notifyScheduleFailure(message);
    await saveScheduleConfig({ failureNotifiedAt: new Date().toISOString() });
  };

  let result: ScheduledRunResult;
  try {
    result = await runScheduledSend(opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyOncePerDay(
      `Next month's Woods Square auto-invite failed to run: ${message}. ` +
        `Open Woods Square → Settings and use "Run now" to retry.`,
    );
    return { fired: true, detail: { error: message } }; // lastFiredAt NOT set → retry later
  }

  if (runHadFailure(result)) {
    await notifyOncePerDay(summarizeFailure(result));
    return { fired: true, detail: result }; // watermark NOT set → retry later
  }

  if (runWasContended(result)) {
    // Collided with another in-flight send (concurrent manual send, or another instance).
    // Not a failure and nothing was sent — don't stamp or alert; the next tick retries once
    // the lock frees, and the other holder will stamp success when it finishes. (#7)
    return { fired: true, detail: { contended: true, ...result } };
  }

  // Clean success — stamp THIS mode's watermark (so a test never marks production done, and
  // vice versa) and clear any prior failure flag.
  const stamp = new Date().toISOString();
  await saveScheduleConfig(
    opts.mode === "test"
      ? { lastTestFiredAt: stamp, failureNotifiedAt: null }
      : { lastProdFiredAt: stamp, failureNotifiedAt: null },
  );
  return { fired: true, detail: result };
}

/**
 * The self-guarding decision shared by the HTTP cron and the built-in timer: reads the
 * config and decides whether to fire now. Test mode fires once `testFireAt` passes;
 * production fires on the last Monday at/after noon SGT, once per day. A FAILED run is not
 * marked done — it's retried after {@link RETRY_BACKOFF_MS} (and admins are alerted), so a
 * transient outage on the last Monday doesn't silently cost staff a whole month's access.
 * Returns what it did (or why it skipped).
 */
export async function maybeRunSchedule(): Promise<{ fired: boolean; detail: unknown }> {
  const config = await getScheduleConfig();
  if (!config.enabled) return { fired: false, detail: "scheduler disabled" };

  const now = Date.now();
  const today = sgtToday();
  const todayKey = today.toISOString().slice(0, 10);

  // After a failed attempt we retry, but not before the backoff elapses — so a transient
  // outage gets another chance without re-attempting every minute.
  const withinBackoff =
    !!config.lastAttemptAt && now - new Date(config.lastAttemptAt).getTime() < RETRY_BACKOFF_MS;

  // ── Test mode: fire once the chosen time passes (retried on failure) ──
  if (config.testMode) {
    if (!config.testFireAt || config.testRecipientIds.length === 0) {
      return { fired: false, detail: "test not fully configured" };
    }
    const fireAt = new Date(config.testFireAt).getTime();
    if (now < fireAt) return { fired: false, detail: "test not due yet" };
    // `lastTestFiredAt` is only stamped on a TEST SUCCESS, so this means "already succeeded".
    if (config.lastTestFiredAt && new Date(config.lastTestFiredAt).getTime() >= fireAt) {
      return { fired: false, detail: "test already fired" };
    }
    if (withinBackoff) return { fired: false, detail: "waiting before retry" };
    return runAndFinalize(config, { mode: "test", testRecipientIds: config.testRecipientIds }, todayKey);
  }

  // ── Production: last Monday at/after noon SGT, with catch-up through month-end ──
  // `lastProdFiredAt` is only stamped on a PRODUCTION SUCCESS, so this means "already sent
  // this month" — once it succeeds it won't run again this month (and a same-day test never
  // blocks it, since that stamps a different watermark).
  const todayMonthKey = todayKey.slice(0, 7);
  const prodMonthKey = config.lastProdFiredAt ? sgtDayKey(config.lastProdFiredAt).slice(0, 7) : null;
  if (prodMonthKey === todayMonthKey) return { fired: false, detail: "already sent this month" };
  // Fire on the last Monday, OR on any later day of the same month as a CATCH-UP if the send
  // hasn't succeeded yet — so a full-day outage on the last Monday doesn't cost the month. (#9)
  const isLastMon = isLastMondayOfMonth(today);
  const isCatchUp = isAfterLastMondayOfMonth(today);
  if (!isLastMon && !isCatchUp) return { fired: false, detail: "before this month's send window" };
  const sgtHour = new Date(now + 8 * 60 * 60 * 1000).getUTCHours();
  if (isLastMon && sgtHour < 12) return { fired: false, detail: "before noon SGT" };
  if (withinBackoff) return { fired: false, detail: "waiting before retry" };
  return runAndFinalize(config, { mode: "production" }, todayKey);
}

/** Notify every admin that the month's real send never went out (best-effort). */
async function notifyMissedSend(testMode: boolean): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { roles: { hasSome: ["ADMIN", "HR", "MANAGER"] } },
    select: { id: true },
  });
  if (admins.length === 0) return;
  const message = testMode
    ? `Automatic Woods Square invites are ON but still in TEST MODE — this month's real send to all staff did not go out. Open Woods Square → Settings, switch Test mode off, then use "Run now" to send next month's invites.`
    : `This month's automatic Woods Square send didn't run, so staff may be missing next month's building PINs. Open Woods Square → Settings and use "Run now" to send them.`;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: "Woods Square: monthly invites not sent",
      message,
      type: "WOODS_SQUARE_SEND_FAILED",
      link: "/woods-square?tab=manage",
    })),
  });
}

/**
 * Backstop for the silent "it's set up but never actually sends" case (gap #3): the scheduler
 * is ENABLED, the month's send window (last Monday) has passed, yet no real production send
 * happened this month — because Test mode was left on, or the run was missed. Nudges admins
 * ONCE per month so it surfaces instead of staff silently going without PINs. A deliberately
 * DISABLED scheduler isn't a fault here — the always-visible Settings banner covers that — so
 * this only fires when someone turned automation on and it quietly isn't doing its job.
 * Runs the day AFTER the last Monday onward, so it never races/duplicates the run (or its
 * gap-#1 failure alert) on the day itself.
 */
export async function maybeWarnMissedSend(): Promise<{ warned: boolean; detail: unknown }> {
  const config = await getScheduleConfig();
  if (!config.enabled) return { warned: false, detail: "scheduler disabled" };

  const today = sgtToday();
  if (!isAfterLastMondayOfMonth(today)) return { warned: false, detail: "send window not passed yet" };

  const todayMonthKey = today.toISOString().slice(0, 7);
  const prodMonthKey = config.lastProdFiredAt ? sgtDayKey(config.lastProdFiredAt).slice(0, 7) : null;
  if (prodMonthKey === todayMonthKey) return { warned: false, detail: "already sent this month" };
  if (config.missedNotifiedMonth === todayMonthKey) {
    return { warned: false, detail: "already warned this month" };
  }

  await notifyMissedSend(config.testMode);
  await saveScheduleConfig({ missedNotifiedMonth: todayMonthKey });
  return { warned: true, detail: { testMode: config.testMode, month: todayMonthKey } };
}

/**
 * Built-in scheduler timer — checks every minute whether a run is due, so the trigger
 * fires on its own with no external cron. Safe to call repeatedly (starts once); skips
 * overlapping ticks; long sends are still single-flighted by the send-core's lock.
 */
// Started-flag lives on globalThis so a dev HMR rebuild (which re-evaluates this module)
// can't stack a second setInterval; in production it starts exactly once. (#7)
const timerGlobal = globalThis as unknown as { __wsTimerStarted?: boolean };
let tickRunning = false;
export function startScheduleTimer(): void {
  if (timerGlobal.__wsTimerStarted) return;
  timerGlobal.__wsTimerStarted = true;
  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const r = await maybeRunSchedule();
      if (r.fired) console.log("[woods-square-scheduler] fired:", JSON.stringify(r.detail));
      const w = await maybeWarnMissedSend();
      if (w.warned) console.log("[woods-square-scheduler] missed-send nudge:", JSON.stringify(w.detail));
    } catch (err) {
      console.error("[woods-square-scheduler] tick failed:", err);
    } finally {
      tickRunning = false;
    }
  };
  setInterval(tick, 60_000);
  console.log("[woods-square-scheduler] in-app minute timer started");
}
