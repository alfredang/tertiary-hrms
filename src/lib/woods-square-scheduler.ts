import { format, parseISO } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  FROM_TIME,
  HABITAP_DATE_FMT,
  TO_TIME,
  isLastMondayOfMonth,
  monthWindows,
  upcomingMonthOf,
} from "@/lib/woods-square";
// Type only — the send-core (and its node-only deps: process-lock/crypto, habitap/
// playwright) is imported lazily inside runScheduledSend, so it never enters the
// instrumentation/timer static bundle (which can't webpack those).
import type { SendOutcome } from "@/lib/woods-square-send";
import { getScheduleConfig, saveScheduleConfig } from "@/lib/woods-square-schedule";

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

/**
 * The self-guarding decision shared by the HTTP cron and the built-in timer: reads the
 * config and decides whether to fire now. Test mode fires once `testFireAt` passes;
 * production fires on the last Monday at/after noon SGT, once per day. Returns what it
 * did (or why it skipped).
 */
export async function maybeRunSchedule(): Promise<{ fired: boolean; detail: unknown }> {
  const config = await getScheduleConfig();
  if (!config.enabled) return { fired: false, detail: "scheduler disabled" };

  const now = Date.now();
  const today = sgtToday();
  const todayKey = today.toISOString().slice(0, 10);

  // ── Test mode: fire once the chosen time passes ──
  if (config.testMode) {
    if (!config.testFireAt || config.testRecipientIds.length === 0) {
      return { fired: false, detail: "test not fully configured" };
    }
    const fireAt = new Date(config.testFireAt).getTime();
    if (now < fireAt) return { fired: false, detail: "test not due yet" };
    if (config.lastFiredAt && new Date(config.lastFiredAt).getTime() >= fireAt) {
      return { fired: false, detail: "test already fired" };
    }
    const result = await runScheduledSend({ mode: "test", testRecipientIds: config.testRecipientIds });
    await saveScheduleConfig({ lastFiredAt: new Date().toISOString() });
    return { fired: true, detail: result };
  }

  // ── Production: last Monday, at/after 12:00 SGT, once per day ──
  if (!isLastMondayOfMonth(today)) return { fired: false, detail: "not the last Monday" };
  const sgtHour = new Date(now + 8 * 60 * 60 * 1000).getUTCHours();
  if (sgtHour < 12) return { fired: false, detail: "before noon SGT" };
  if (config.lastFiredAt) {
    const lastKey = new Date(new Date(config.lastFiredAt).getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (lastKey === todayKey) return { fired: false, detail: "already ran today" };
  }
  const result = await runScheduledSend({ mode: "production" });
  await saveScheduleConfig({ lastFiredAt: new Date().toISOString() });
  return { fired: true, detail: result };
}

/**
 * Built-in scheduler timer — checks every minute whether a run is due, so the trigger
 * fires on its own with no external cron. Safe to call repeatedly (starts once); skips
 * overlapping ticks; long sends are still single-flighted by the send-core's lock.
 */
let timerStarted = false;
let tickRunning = false;
export function startScheduleTimer(): void {
  if (timerStarted) return;
  timerStarted = true;
  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const r = await maybeRunSchedule();
      if (r.fired) console.log("[woods-square-scheduler] fired:", JSON.stringify(r.detail));
    } catch (err) {
      console.error("[woods-square-scheduler] tick failed:", err);
    } finally {
      tickRunning = false;
    }
  };
  setInterval(tick, 60_000);
  console.log("[woods-square-scheduler] in-app minute timer started");
}
