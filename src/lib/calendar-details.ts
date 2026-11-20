// Detail lines for a calendar event (Alfred, 20 Nov 2026): what the hover card and the day agenda
// show under the title, e.g. the reason given for an MC. Built on the server from the leave or
// time-off request, so the client only renders label / value pairs.

export type CalendarDetail = { label: string; value: string };

const sgDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** "1 day", "0.5 day", "3 days". */
export function dayCount(days: number): string {
  return `${days} ${days <= 1 ? "day" : "days"}`;
}

export function leaveDetails(r: {
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  days: number;
  dayType?: string | null;
  halfDayPosition?: string | null;
  reason?: string | null;
  hasDocument?: boolean;
  /** Medical leave: say whether an MC was uploaded. */
  medical?: boolean;
}): CalendarDetail[] {
  const from = sgDate(r.startDate);
  const to = sgDate(r.endDate);
  const half =
    r.dayType === "AM_HALF" ? " (AM half)"
    : r.dayType === "PM_HALF" ? " (PM half)"
    : r.halfDayPosition ? ` (half on ${r.halfDayPosition} day)`
    : "";
  return [
    { label: "Type", value: r.leaveTypeName },
    { label: "Dates", value: from === to ? from : `${from} – ${to}` },
    { label: "Days", value: `${dayCount(r.days)}${half}` },
    { label: "Reason", value: clean(r.reason) || "No reason given" },
    ...(r.medical ? [{ label: "MC", value: r.hasDocument ? "Uploaded" : "Not uploaded" }] : []),
  ];
}

export function timeOffDetails(t: {
  offDay: boolean;
  startTime: string;
  endTime: string;
  hours: number;
  reasonLabel: string;
  reasonDetail?: string | null;
}): CalendarDetail[] {
  if (t.offDay) {
    const note = clean(t.reasonDetail);
    return [{ label: "Type", value: "Off Day (full day)" }, ...(note ? [{ label: "Reason", value: note }] : [])];
  }
  const detail = clean(t.reasonDetail);
  return [
    { label: "Time", value: `${t.startTime} – ${t.endTime}` },
    { label: "Hours", value: `${t.hours} h` },
    { label: "Reason", value: detail ? `${t.reasonLabel}: ${detail}` : t.reasonLabel },
  ];
}
