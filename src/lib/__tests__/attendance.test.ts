import { describe, it, expect } from "vitest";
import { punchHours, toPunchDto } from "@/lib/attendance";

describe("punchHours", () => {
  it("returns null when not clocked out yet", () => {
    expect(punchHours(new Date(), null)).toBeNull();
    expect(punchHours(null, null)).toBeNull();
  });

  it("computes hours rounded to 2dp", () => {
    const start = new Date("2026-07-27T02:23:00Z");
    const end = new Date("2026-07-27T10:53:00Z"); // 8.5h later
    expect(punchHours(start, end)).toBe(8.5);
  });

  it("clamps negative durations to 0", () => {
    const start = new Date("2026-07-27T10:00:00Z");
    const end = new Date("2026-07-27T09:00:00Z");
    expect(punchHours(start, end)).toBe(0);
  });
});

describe("toPunchDto", () => {
  it("serializes a completed punch", () => {
    const dto = toPunchDto({
      id: "p1",
      date: new Date("2026-07-27T00:00:00Z"),
      clockIn: new Date("2026-07-27T02:23:00Z"),
      clockOut: new Date("2026-07-27T06:23:00Z"),
    });
    expect(dto).toEqual({
      id: "p1",
      date: "2026-07-27",
      clockIn: "2026-07-27T02:23:00.000Z",
      clockOut: "2026-07-27T06:23:00.000Z",
      hours: 4,
    });
  });

  it("serializes an open punch with null hours", () => {
    const dto = toPunchDto({
      id: "p2",
      date: new Date("2026-07-27T00:00:00Z"),
      clockIn: new Date("2026-07-27T02:23:00Z"),
      clockOut: null,
    });
    expect(dto.clockOut).toBeNull();
    expect(dto.hours).toBeNull();
  });
});
