import { describe, expect, it } from "vitest";
import { personMonthSummary, type SummaryEvent } from "../calendar-summary";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);
const leave = (category: string, start: Date, end: Date, days: number, personId = "p1"): SummaryEvent => ({
  category, start, end, allDay: true, personId, days,
});

describe("personMonthSummary", () => {
  it("adds up each kind of leave and time off for the person in the month", () => {
    const events: SummaryEvent[] = [
      leave("ANNUAL_LEAVE", d(2026, 11, 2), d(2026, 11, 3), 2),
      leave("ANNUAL_LEAVE", d(2026, 11, 6), d(2026, 11, 6), 0.5),
      leave("MEDICAL_LEAVE", d(2026, 11, 10), d(2026, 11, 10), 1),
      leave("NO_PAY_LEAVE", d(2026, 11, 12), d(2026, 11, 13), 2),
      leave("OTHER_LEAVE", d(2026, 11, 16), d(2026, 11, 16), 1),
      { category: "TIME_OFF", start: d(2026, 11, 18), end: d(2026, 11, 18), allDay: false, personId: "p1", hours: 2.5 },
      { category: "TIME_OFF", start: d(2026, 11, 19), end: d(2026, 11, 19), allDay: false, personId: "p1", hours: 1 },
      { category: "TIME_OFF", start: d(2026, 11, 20), end: d(2026, 11, 20), allDay: true, personId: "p1", hours: 0 },
    ];
    expect(personMonthSummary(events, "p1", 2026, 10)).toEqual({
      annualLeaveDays: 2.5, medicalLeaveDays: 1, noPayLeaveDays: 2, otherLeaveDays: 1, timeOffHours: 3.5, offDays: 1, workingDays: 0,
    });
  });

  it("ignores other people, other months and non-leave events", () => {
    const events: SummaryEvent[] = [
      leave("ANNUAL_LEAVE", d(2026, 11, 2), d(2026, 11, 2), 1, "p2"),
      leave("ANNUAL_LEAVE", d(2026, 10, 26), d(2026, 10, 26), 1),
      { category: "MEETING", start: d(2026, 11, 4), end: d(2026, 11, 4), allDay: false, personId: "p1" },
      { category: "TIME_OFF", start: d(2026, 12, 1), end: d(2026, 12, 1), allDay: false, personId: "p1", hours: 2 },
    ];
    expect(personMonthSummary(events, "p1", 2026, 10)).toEqual({
      annualLeaveDays: 0, medicalLeaveDays: 0, noPayLeaveDays: 0, otherLeaveDays: 0, timeOffHours: 0, offDays: 0, workingDays: 0,
    });
  });

  it("splits a leave that crosses the month end by working days", () => {
    // Thu 29 Oct – Tue 3 Nov 2026: 4 working days (29, 30 Oct; 2, 3 Nov).
    const events = [leave("ANNUAL_LEAVE", d(2026, 10, 29), d(2026, 11, 3), 4)];
    expect(personMonthSummary(events, "p1", 2026, 9).annualLeaveDays).toBe(2);
    expect(personMonthSummary(events, "p1", 2026, 10).annualLeaveDays).toBe(2);
  });

  it("leaves public holidays out of the split", () => {
    // Fri 30 Oct – Tue 3 Nov, with Mon 2 Nov a holiday: 2 working days, one in each month.
    const events = [leave("MEDICAL_LEAVE", d(2026, 10, 30), d(2026, 11, 3), 2)];
    const holidays = new Set(["2026-11-02"]);
    expect(personMonthSummary(events, "p1", 2026, 9, holidays).medicalLeaveDays).toBe(1);
    expect(personMonthSummary(events, "p1", 2026, 10, holidays).medicalLeaveDays).toBe(1);
  });
});

describe("personMonthSummary working days", () => {
  it("counts each day with a clock-in once, only in the month and only for the person", async () => {
    const { personMonthSummary } = await import("@/lib/calendar-summary");
    const att = (id: string, at: string, personId = "p1") => ({ category: "ATTENDANCE", start: new Date(at), end: new Date(at), allDay: false, personId, id });
    const s = personMonthSummary(
      [
        att("a", "2026-11-02T09:00:00"),
        att("b", "2026-11-03T09:00:00"),
        att("c", "2026-11-03T14:00:00"), // same day again
        att("d", "2026-10-30T09:00:00"), // previous month
        att("e", "2026-11-04T09:00:00", "p2"), // someone else
      ],
      "p1", 2026, 10,
    );
    expect(s.workingDays).toBe(2);
  });

  it("adds everyone together when no person is picked", () => {
    const events: SummaryEvent[] = [
      leave("ANNUAL_LEAVE", d(2026, 11, 2), d(2026, 11, 3), 2, "p1"),
      leave("ANNUAL_LEAVE", d(2026, 11, 2), d(2026, 11, 2), 0.5, "p2"),
      leave("MEDICAL_LEAVE", d(2026, 11, 10), d(2026, 11, 10), 1, "p2"),
      leave("NO_PAY_LEAVE", d(2026, 11, 12), d(2026, 11, 12), 1, "p3"),
      { category: "TIME_OFF", start: d(2026, 11, 18), end: d(2026, 11, 18), allDay: false, personId: "p1", hours: 2 },
      { category: "TIME_OFF", start: d(2026, 11, 18), end: d(2026, 11, 18), allDay: false, personId: "p3", hours: 1.5 },
      // No person (a holiday, a meeting) and another month: not counted.
      { category: "HOLIDAY", start: d(2026, 11, 9), end: d(2026, 11, 9), allDay: true },
      leave("ANNUAL_LEAVE", d(2026, 10, 26), d(2026, 10, 26), 1, "p3"),
    ];
    expect(personMonthSummary(events, null, 2026, 10)).toEqual({
      annualLeaveDays: 2.5, medicalLeaveDays: 1, noPayLeaveDays: 1, otherLeaveDays: 0, timeOffHours: 3.5, offDays: 0, workingDays: 0,
    });
  });
});
