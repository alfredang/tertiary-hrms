import { describe, expect, it } from "vitest";
import {
  birthdayEvents,
  categoryTitle,
  holidayTitle,
  CALENDAR_CATEGORIES,
  calendarCategoryColor,
  eventCategory,
  isPersonCategory,
  leaveCategory,
} from "@/lib/calendar-categories";

describe("leaveCategory", () => {
  it("maps annual and off-in-lieu leave to Annual Leave", () => {
    expect(leaveCategory({ code: "AL", paid: true })).toBe("ANNUAL_LEAVE");
    expect(leaveCategory({ code: "AL_OT", paid: true })).toBe("ANNUAL_LEAVE");
  });
  it("maps MC and sick leave to Medical Leave", () => {
    expect(leaveCategory({ code: "MC", paid: true })).toBe("MEDICAL_LEAVE");
    expect(leaveCategory({ code: "SL", paid: true })).toBe("MEDICAL_LEAVE");
  });
  it("treats NPL and any unpaid type as No Pay Leave", () => {
    expect(leaveCategory({ code: "NPL", paid: true })).toBe("NO_PAY_LEAVE");
    expect(leaveCategory({ code: "MC", paid: false })).toBe("NO_PAY_LEAVE");
  });
  it("puts other paid types under Other Leave and unknown under Annual Leave", () => {
    expect(leaveCategory({ code: "CL", paid: true })).toBe("OTHER_LEAVE");
    expect(leaveCategory(null)).toBe("ANNUAL_LEAVE");
  });
});

describe("calendar categories", () => {
  it("gives every category its own valid colour", () => {
    const colors = CALENDAR_CATEGORIES.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(calendarCategoryColor("MEDICAL_LEAVE")).not.toBe(calendarCategoryColor("ANNUAL_LEAVE"));
  });
  it("applies the person filter to leave and time off only", () => {
    expect(isPersonCategory("NO_PAY_LEAVE")).toBe(true);
    expect(isPersonCategory("TIME_OFF")).toBe(true);
    expect(isPersonCategory("HOLIDAY")).toBe(false);
    expect(isPersonCategory("MEETING")).toBe(false);
  });
  it("keeps known event types and falls back for unknown ones", () => {
    expect(eventCategory("TRAINING")).toBe("TRAINING");
    expect(eventCategory("SOMETHING_NEW")).toBe("COMPANY_EVENT");
  });
});

describe("holidayTitle", () => {
  it("puts the holiday's emoji in front of its name", () => {
    expect(holidayTitle("Christmas Day")).toBe("🎄 Christmas Day");
    expect(holidayTitle("Chinese New Year")).toBe("🧧 Chinese New Year");
    expect(holidayTitle("New Year's Day")).toBe("🎆 New Year's Day");
    expect(holidayTitle("National Day")).toBe("🇸🇬 National Day");
    expect(holidayTitle("Company Day Off")).toBe("🎉 Company Day Off");
  });
  it("keeps a title that already starts with an emoji", () => {
    expect(holidayTitle("🪔 Deepavali")).toBe("🪔 Deepavali");
  });
});

describe("birthdayEvents", () => {
  it("makes one all-day birthday per person per year, on the Singapore date", () => {
    // Stored as Singapore midnight on 15 Mar 1990 (= 14 Mar 16:00 UTC).
    const events = birthdayEvents(
      [
        { id: "p1", name: "MING XUAN", dateOfBirth: new Date("1990-03-14T16:00:00Z") },
        { id: "p2", name: "NO DATE", dateOfBirth: null },
      ],
      [2026, 2027],
    );
    expect(events.map((e) => e.id)).toEqual(["bd-p1-2026", "bd-p1-2027"]);
    expect(events[0].title).toBe("🎂 MING XUAN birthday");
    expect(events[0].start.toISOString()).toBe("2026-03-15T04:00:00.000Z");
    expect(events[0].allDay).toBe(true);
    expect(events[0].personId).toBe("p1");
  });
  it("moves a 29 Feb birthday to 28 Feb in a non-leap year", () => {
    const [e2027, e2028] = birthdayEvents([{ id: "p", name: "LEAP", dateOfBirth: new Date("2000-02-29T00:00:00Z") }], [2027, 2028]);
    expect(e2027.start.toISOString()).toBe("2027-02-28T04:00:00.000Z");
    expect(e2028.start.toISOString()).toBe("2028-02-29T04:00:00.000Z");
  });
});

describe("categoryTitle", () => {
  it("gives medical leave and annual leave different emoji", () => {
    expect(categoryTitle("MEDICAL_LEAVE", "DEEPA - Medical Leave")).toBe("🤒 DEEPA - Medical Leave");
    expect(categoryTitle("ANNUAL_LEAVE", "DEEPA - Annual Leave")).toBe("🏖️ DEEPA - Annual Leave");
    expect(categoryTitle("NO_PAY_LEAVE", "DEEPA - No Pay Leave")).toBe("💸 DEEPA - No Pay Leave");
  });
  it("leaves meetings and titles that already have an emoji alone", () => {
    expect(categoryTitle("MEETING", "Board meeting")).toBe("Board meeting");
    expect(categoryTitle("MEDICAL_LEAVE", "🤒 DEEPA - MC")).toBe("🤒 DEEPA - MC");
  });
});
