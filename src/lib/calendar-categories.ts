// Colour coding for the calendar (Alfred, 20 Nov 2026): one colour per kind of activity, so annual
// leave, medical leave, no-pay leave and time off can be told apart at a glance. The page tags every
// event with a category; the month grid, the day agenda and the legend all read the same table.

export type CalendarCategory =
  | "HOLIDAY"
  | "ANNUAL_LEAVE"
  | "MEDICAL_LEAVE"
  | "NO_PAY_LEAVE"
  | "OTHER_LEAVE"
  | "TIME_OFF"
  | "MEETING"
  | "TRAINING"
  | "COMPANY_EVENT";

/** Legend order. Colours are #RRGGBB: the chip tints the fill and uses the colour for the text. */
export const CALENDAR_CATEGORIES: { key: CalendarCategory; label: string; color: string }[] = [
  { key: "HOLIDAY", label: "Public Holiday", color: "#ef4444" },
  { key: "ANNUAL_LEAVE", label: "Annual Leave", color: "#f59e0b" },
  { key: "MEDICAL_LEAVE", label: "Medical Leave", color: "#ec4899" },
  { key: "NO_PAY_LEAVE", label: "No Pay Leave", color: "#64748b" },
  { key: "OTHER_LEAVE", label: "Other Leave", color: "#9a6b4f" },
  { key: "TIME_OFF", label: "Time Off", color: "#06b6d4" },
  { key: "MEETING", label: "Meeting", color: "#3b82f6" },
  { key: "TRAINING", label: "Training", color: "#a855f7" },
  { key: "COMPANY_EVENT", label: "Company Event", color: "#22c55e" },
];

const BY_KEY = new Map(CALENDAR_CATEGORIES.map((c) => [c.key, c]));

export function calendarCategoryColor(category: CalendarCategory): string {
  return BY_KEY.get(category)?.color ?? "#6b7280";
}

export function calendarCategoryLabel(category: string): string {
  return BY_KEY.get(category as CalendarCategory)?.label ?? category;
}

/** Leave and time off belong to a person, so the person filter applies to them. */
export function isPersonCategory(category: string): boolean {
  return category === "TIME_OFF" || category.endsWith("_LEAVE");
}

/**
 * Category of an approved leave, from its leave type. No-pay is decided first: an unpaid type is
 * No Pay Leave whatever its code. A leave whose type is unknown stays Annual Leave (the old colour).
 */
export function leaveCategory(leaveType?: { code: string; paid: boolean } | null): CalendarCategory {
  if (!leaveType) return "ANNUAL_LEAVE";
  const code = leaveType.code.toUpperCase();
  if (code === "NPL" || !leaveType.paid) return "NO_PAY_LEAVE";
  if (code === "AL" || code === "AL_OT") return "ANNUAL_LEAVE";
  if (code === "MC" || code === "SL") return "MEDICAL_LEAVE";
  return "OTHER_LEAVE";
}

/** Category of a non-leave calendar event, from its stored type. */
export function eventCategory(type: string): CalendarCategory {
  return BY_KEY.has(type as CalendarCategory) ? (type as CalendarCategory) : "COMPANY_EVENT";
}
