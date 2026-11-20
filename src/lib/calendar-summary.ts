// Month totals for one person on the calendar (Alfred, 20 Nov 2026): when the admin filters the
// calendar by a staff member or intern, the month shown carries how much annual leave, medical
// leave, no-pay leave and time off that person has in it.

export interface SummaryEvent {
  category: string;
  start: Date | string;
  end: Date | string;
  allDay: boolean;
  personId?: string;
  /** Leave: the days charged for the whole request (0.5 for a half day). */
  days?: number;
  /** Time off: hours taken (0 for a full Off Day). */
  hours?: number;
}

export interface PersonMonthSummary {
  annualLeaveDays: number;
  medicalLeaveDays: number;
  noPayLeaveDays: number;
  otherLeaveDays: number;
  timeOffHours: number;
  /** Approved full-day Off Days (interns). */
  offDays: number;
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Totals for `personId` in the month (`month` is 0-based), in the viewer's local time, the same
 * way the month grid places events.
 *
 * A leave wholly inside the month counts its charged days. A leave that crosses a month boundary
 * is split by working days (Mon–Fri, public holidays excluded, as leave is charged), so the months
 * together add up to the charged days.
 */
export function personMonthSummary(
  events: SummaryEvent[],
  personId: string,
  year: number,
  month: number,
  holidayKeys: ReadonlySet<string> = new Set(),
): PersonMonthSummary {
  const out: PersonMonthSummary = {
    annualLeaveDays: 0, medicalLeaveDays: 0, noPayLeaveDays: 0, otherLeaveDays: 0, timeOffHours: 0, offDays: 0,
  };
  const inMonth = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
  const isWorking = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !holidayKeys.has(key(d));

  for (const e of events) {
    if (e.personId !== personId) continue;
    const start = new Date(e.start);
    const end = new Date(e.end);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (e.category === "TIME_OFF") {
      if (!inMonth(start)) continue;
      if (e.allDay) out.offDays += 1;
      else out.timeOffHours += e.hours ?? 0;
      continue;
    }
    if (!e.category.endsWith("_LEAVE")) continue;

    // Working and calendar days of the leave, in total and inside the month.
    let working = 0, workingIn = 0, calendar = 0, calendarIn = 0;
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      calendar += 1;
      if (inMonth(d)) calendarIn += 1;
      if (isWorking(d)) {
        working += 1;
        if (inMonth(d)) workingIn += 1;
      }
    }
    if (calendarIn === 0) continue;
    const charged = e.days ?? working;
    // No working day in the range (e.g. weekend leave): fall back to calendar days.
    const share = calendarIn === calendar ? 1 : working > 0 ? workingIn / working : calendarIn / calendar;
    const days = charged * share;

    if (e.category === "ANNUAL_LEAVE") out.annualLeaveDays += days;
    else if (e.category === "MEDICAL_LEAVE") out.medicalLeaveDays += days;
    else if (e.category === "NO_PAY_LEAVE") out.noPayLeaveDays += days;
    else out.otherLeaveDays += days;
  }

  out.annualLeaveDays = round2(out.annualLeaveDays);
  out.medicalLeaveDays = round2(out.medicalLeaveDays);
  out.noPayLeaveDays = round2(out.noPayLeaveDays);
  out.otherLeaveDays = round2(out.otherLeaveDays);
  out.timeOffHours = round2(out.timeOffHours);
  return out;
}
