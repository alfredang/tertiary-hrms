import { describe, it, expect } from "vitest";
import {
  isOffDay,
  timeOffWhen,
  appSafeTimeOffReason,
  parseTimeToMinutes,
  computeTimeOffHours,
  formatTime12h,
  timeOffReasonLabel,
  TIME_OFF_REASONS,
} from "../time-off";

describe("parseTimeToMinutes", () => {
  it("parses valid times", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("9:30")).toBe(570);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed input", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("12:60")).toBeNull();
    expect(parseTimeToMinutes("noon")).toBeNull();
    expect(parseTimeToMinutes("12")).toBeNull();
  });
});

describe("computeTimeOffHours", () => {
  it("computes whole and fractional hours", () => {
    expect(computeTimeOffHours("09:00", "12:00")).toBe(3);
    expect(computeTimeOffHours("09:00", "09:30")).toBe(0.5);
    expect(computeTimeOffHours("14:15", "17:45")).toBe(3.5);
    expect(computeTimeOffHours("09:00", "09:20")).toBe(0.33);
  });

  it("rejects zero, negative, or malformed ranges", () => {
    expect(computeTimeOffHours("09:00", "09:00")).toBeNull();
    expect(computeTimeOffHours("12:00", "09:00")).toBeNull();
    expect(computeTimeOffHours("bad", "09:00")).toBeNull();
    expect(computeTimeOffHours("09:00", "25:00")).toBeNull();
  });
});

describe("formatTime12h", () => {
  it("formats AM/PM correctly", () => {
    expect(formatTime12h("00:05")).toBe("12:05 AM");
    expect(formatTime12h("09:30")).toBe("9:30 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
    expect(formatTime12h("14:05")).toBe("2:05 PM");
    expect(formatTime12h("23:59")).toBe("11:59 PM");
  });

  it("passes through malformed input unchanged", () => {
    expect(formatTime12h("bad")).toBe("bad");
  });
});

describe("timeOffReasonLabel", () => {
  it("maps every enum value to its display label", () => {
    expect(timeOffReasonLabel("EXAMS")).toBe("Exams");
    expect(timeOffReasonLabel("EMERGENCY")).toBe("Emergency — Pls approve");
    expect(timeOffReasonLabel("UNPAID_LEAVE")).toBe("Unpaid Leave");
    expect(timeOffReasonLabel("OTHERS")).toBe("Others — Pls specify");
  });

  it("has exactly the five required reasons (Off Day first)", () => {
    expect(TIME_OFF_REASONS.map((r) => r.value)).toEqual(["OFF_DAY", "EXAMS", "EMERGENCY", "UNPAID_LEAVE", "OTHERS"]);
  });
});


describe("Off Day", () => {
  it("is offered as a reason", () => {
    expect(TIME_OFF_REASONS.map((r) => r.value)).toContain("OFF_DAY");
    expect(isOffDay("OFF_DAY")).toBe(true);
    expect(isOffDay("EXAMS")).toBe(false);
  });

  it("shows Full day instead of times", () => {
    expect(timeOffWhen({ reason: "OFF_DAY", startTime: "00:00", endTime: "23:59", hours: 0 })).toBe("Full day");
    expect(timeOffWhen({ reason: "EXAMS", startTime: "14:00", endTime: "16:30", hours: 2.5 })).toBe("14:00 – 16:30 (2.5 h)");
  });

  it("goes to the native apps as OTHERS with a readable detail", () => {
    expect(appSafeTimeOffReason({ reason: "OFF_DAY", reasonDetail: null })).toEqual({
      reason: "OTHERS",
      reasonDetail: "Off Day (full day)",
      offDay: true,
    });
    expect(appSafeTimeOffReason({ reason: "EXAMS", reasonDetail: "Finals" })).toEqual({
      reason: "EXAMS",
      reasonDetail: "Finals",
      offDay: false,
    });
  });
});
