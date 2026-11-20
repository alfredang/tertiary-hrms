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
  | "ATTENDANCE"
  | "BIRTHDAY"
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
  // Interns' and accountants' clock-in / clock-out, one "✅ In 09:02 · Out 18:05" per day (Alfred, 20 Nov 2026).
  { key: "ATTENDANCE", label: "Clock In/Out", color: "#84cc16" },
  { key: "BIRTHDAY", label: "Birthday", color: "#d946ef" },
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

/**
 * Birthday events for the admin calendar (Alfred, 20 Nov 2026): one all-day "🎂 <name> birthday"
 * per person per year. Only the day and month are used, so the age is never shown. The stored date
 * is read in Singapore time; a 29 Feb birthday falls on 28 Feb in a non-leap year.
 */
export function birthdayEvents(
  people: { id: string; name: string; dateOfBirth: Date | null }[],
  years: number[],
) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return people.flatMap((p) => {
    if (!p.dateOfBirth) return [];
    const sgt = new Date(p.dateOfBirth.getTime() + 8 * 3600 * 1000);
    const month = sgt.getUTCMonth() + 1;
    const day = sgt.getUTCDate();
    return years.map((year) => {
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const d = month === 2 && day === 29 && !leap ? 28 : day;
      // SGT noon, so the browser places it on the right day.
      const at = new Date(`${year}-${pad(month)}-${pad(d)}T12:00:00+08:00`);
      return {
        id: `bd-${p.id}-${year}`,
        title: `🎂 ${p.name} birthday`,
        start: at,
        end: at,
        allDay: true,
        type: "BIRTHDAY",
        category: "BIRTHDAY" as CalendarCategory,
        color: calendarCategoryColor("BIRTHDAY"),
        description: "Birthday",
        personId: p.id,
        personName: p.name,
      };
    });
  });
}

/** Emoji per Singapore public holiday, matched on the holiday name (Alfred, 20 Nov 2026). */
const HOLIDAY_EMOJI: [RegExp, string][] = [
  [/chinese new year|lunar new year/i, "🧧"],
  [/new year/i, "🎆"],
  [/good friday/i, "✝️"],
  [/easter/i, "🐣"],
  [/hari raya puasa|aidilfitri|eid al-fitr/i, "🌙"],
  [/hari raya haji|aidiladha|eid al-adha/i, "🕌"],
  [/labou?r day|may day/i, "🛠️"],
  [/vesak/i, "🪷"],
  [/national day/i, "🇸🇬"],
  [/deepavali|diwali/i, "🪔"],
  [/christmas/i, "🎄"],
  [/polling|election/i, "🗳️"],
];

/** Holiday title with its emoji in front: "🎄 Christmas Day". A title that already starts with an emoji is kept. */
export function holidayTitle(name: string): string {
  if ((name.codePointAt(0) ?? 0) >= 0x2000) return name;
  const emoji = HOLIDAY_EMOJI.find(([re]) => re.test(name))?.[1] ?? "🎉";
  return `${emoji} ${name}`;
}

/** Emoji per kind of leave and time off, so MC and leave read differently at a glance (Alfred, 20 Nov 2026). */
const CATEGORY_EMOJI: Partial<Record<CalendarCategory, string>> = {
  ANNUAL_LEAVE: "🏖️",
  MEDICAL_LEAVE: "🤒",
  NO_PAY_LEAVE: "💸",
  OTHER_LEAVE: "📋",
  TIME_OFF: "⏰",
};

/** The emoji shown in front of a leave / time-off title ("" for other categories). The apps use it too. */
export function categoryEmoji(category: string): string {
  if (category === "BIRTHDAY") return "🎂";
  if (category === "ATTENDANCE") return "✅";
  return CATEGORY_EMOJI[category as CalendarCategory] ?? "";
}

/** Leave / time-off title with its category emoji in front: "🤒 DEEPA ARUMUGAM - Medical Leave". */
export function categoryTitle(category: CalendarCategory, title: string): string {
  const emoji = CATEGORY_EMOJI[category];
  return !emoji || (title.codePointAt(0) ?? 0) >= 0x2000 ? title : `${emoji} ${title}`;
}
