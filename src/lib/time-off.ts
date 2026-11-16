import type { TimeOffReason } from "@prisma/client";

export const TIME_OFF_REASONS = [
  {
    value: "OFF_DAY" as const,
    label: "Off Day (full day)",
    hint: "A whole day off. Once approved, you don't need to clock in or out that day.",
  },
  {
    value: "EXAMS" as const,
    label: "Exams",
    hint: "Sitting for a scheduled examination.",
  },
  {
    value: "EMERGENCY" as const,
    label: "Emergency — Pls approve",
    hint: "Urgent personal or family matter that cannot wait.",
  },
  {
    value: "UNPAID_LEAVE" as const,
    label: "Unpaid Leave",
    hint: "Time off without pay. No leave balance will be deducted.",
  },
  {
    value: "OTHERS" as const,
    label: "Others — Pls specify",
    hint: "Anything else. You must describe the reason.",
  },
];

/**
 * Off Day = an intern's approved full day off. Stored as one TimeOffRequest with
 * these placeholder times and 0 hours (it is a day, not hours of time off), and
 * the missed clock-in/out check skips the day once it is approved.
 */
export const OFF_DAY_START = "00:00";
export const OFF_DAY_END = "23:59";

export function isOffDay(reason: TimeOffReason | string | null | undefined): boolean {
  return reason === "OFF_DAY";
}

/** "Full day" for an Off Day, else "start – end (N h)" using `fmt` for the times. */
export function timeOffWhen(
  r: { reason: TimeOffReason | string; startTime: string; endTime: string; hours: { toString(): string } | number },
  fmt: (t: string) => string = (t) => t,
): string {
  if (isOffDay(r.reason)) return "Full day";
  return `${fmt(r.startTime)} – ${fmt(r.endTime)} (${Number(r.hours.toString())} h)`;
}

/**
 * Native-app JSON for a time-off row. Shipped iOS/Android builds know only
 * EXAMS / EMERGENCY / UNPAID_LEAVE / OTHERS, so an Off Day is sent as OTHERS with
 * an "Off Day (full day)" detail, plus `offDay: true` for newer builds.
 */
export function appSafeTimeOffReason<T extends { reason: TimeOffReason | string; reasonDetail: string | null }>(
  r: T,
): T & { offDay: boolean } {
  if (!isOffDay(r.reason)) return { ...r, offDay: false };
  return {
    ...r,
    reason: "OTHERS",
    reasonDetail: `Off Day (full day)${r.reasonDetail ? ` — ${r.reasonDetail}` : ""}`,
    offDay: true,
  };
}

export function timeOffReasonLabel(reason: TimeOffReason): string {
  return TIME_OFF_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** "HH:mm" → minutes since midnight. Returns null when malformed. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Hours between two "HH:mm" times on the same day, rounded to 2dp.
 * Returns null when either time is malformed or the range is not positive.
 */
export function computeTimeOffHours(startTime: string, endTime: string): number | null {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return null;
  if (end <= start) return null;
  return Math.round(((end - start) / 60) * 100) / 100;
}

/** "14:05" → "2:05 PM" */
export function formatTime12h(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
