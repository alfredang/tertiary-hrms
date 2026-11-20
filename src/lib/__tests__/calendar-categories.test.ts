import { describe, expect, it } from "vitest";
import {
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
