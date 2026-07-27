import { describe, it, expect } from "vitest";
import {
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
    expect(timeOffReasonLabel("OTHERS")).toBe("Others — Pls specify");
  });

  it("has exactly the three required reasons", () => {
    expect(TIME_OFF_REASONS.map((r) => r.value)).toEqual(["EXAMS", "EMERGENCY", "OTHERS"]);
  });
});
