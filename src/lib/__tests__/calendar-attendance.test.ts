import { describe, expect, it } from "vitest";
import { attendanceEvents, attendanceTitle, attendanceDetails } from "@/lib/calendar-attendance";
import { calendarCategoryColor, categoryEmoji } from "@/lib/calendar-categories";

const day = new Date("2026-11-18T00:00:00.000Z"); // 18 Nov SGT
const inAt = new Date("2026-11-18T09:02:00+08:00");
const outAt = new Date("2026-11-18T18:05:00+08:00");
const later = new Date("2026-11-20T10:00:00+08:00");

describe("calendar attendance", () => {
  it("titles a day with the check emoji and SGT times", () => {
    expect(attendanceTitle(inAt, outAt)).toBe("✅ In 09:02 · Out 18:05");
    expect(attendanceTitle(inAt, null)).toBe("✅ In 09:02");
  });

  it("one event per day with a clock-in, none without", () => {
    const ev = attendanceEvents(
      [
        { id: "p1", date: day, clockIn: inAt, clockOut: outAt, breakSeconds: 3600 },
        { id: "p2", date: day, clockIn: null, clockOut: null },
      ],
      false,
      later,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      id: "att-p1", category: "ATTENDANCE", allDay: false, start: inAt, end: outAt,
      color: calendarCategoryColor("ATTENDANCE"), personId: undefined,
    });
    expect(ev[0].details).toEqual([
      { label: "Clock in", value: "09:02" },
      { label: "Clock out", value: "18:05" },
      { label: "Break", value: "1h 00m" },
      { label: "Worked", value: "8h 03m" },
    ]);
  });

  it("admin view puts the person in front and tags the event with them", () => {
    const [ev] = attendanceEvents([{ id: "p1", date: day, clockIn: inAt, clockOut: outAt, employee: { id: "e1", name: "TAN AH KOW" } }], true, later);
    expect(ev.title).toBe("✅ TAN AH KOW - In 09:02 · Out 18:05");
    expect(ev.personId).toBe("e1");
  });

  it("says still clocked in today, not clocked out on an earlier day", () => {
    const p = { id: "p1", date: day, clockIn: inAt, clockOut: null };
    expect(attendanceDetails(p, new Date("2026-11-18T15:00:00+08:00"))[1]).toEqual({ label: "Clock out", value: "Still clocked in" });
    expect(attendanceDetails(p, later)[1]).toEqual({ label: "Clock out", value: "Not clocked out" });
  });

  it("has the check emoji for the apps", () => {
    expect(categoryEmoji("ATTENDANCE")).toBe("✅");
  });
});
