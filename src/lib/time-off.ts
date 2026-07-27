import type { TimeOffReason } from "@prisma/client";

export const TIME_OFF_REASONS = [
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
    value: "OTHERS" as const,
    label: "Others — Pls specify",
    hint: "Anything else. You must describe the reason.",
  },
];

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
