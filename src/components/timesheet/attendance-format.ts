// Display helpers shared by the clock widget, history and admin overview.
// Times are always rendered in Singapore time regardless of the browser zone.

const TZ = "Asia/Singapore";

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });
}

/** `YYYY-MM-DD` → "Wed, 8 Oct 2026". */
export function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `YYYY-MM` → "October 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Current `YYYY-MM` in Singapore time. */
export function currentMonth(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}

/** Today's `YYYY-MM-DD` in Singapore time. */
export function todayDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Worked ms so far for an open punch: time since clock-in less completed breaks
 * and, while paused, the current break (so the timer freezes).
 */
export function workedMsSoFar(
  clockIn: string,
  nowMs: number,
  breakSeconds = 0,
  pausedAt: string | null = null,
): number {
  let ms = nowMs - new Date(clockIn).getTime() - breakSeconds * 1000;
  if (pausedAt) ms -= nowMs - new Date(pausedAt).getTime();
  return Math.max(0, ms);
}

/** Worked hours so far, rounded to 2dp — for a punch still open today. */
export function hoursSince(iso: string, breakSeconds = 0, pausedAt: string | null = null): number {
  const ms = workedMsSoFar(iso, Date.now(), breakSeconds, pausedAt);
  return Math.round((ms / 3_600_000) * 100) / 100;
}
