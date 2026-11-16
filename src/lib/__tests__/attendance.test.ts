import { describe, it, expect } from "vitest";
import { punchHours, toPunchDto, monthRange, totalHoursOf } from "@/lib/attendance";

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

  it("excludes completed break time", () => {
    const start = new Date("2026-07-27T01:00:00Z");
    const end = new Date("2026-07-27T10:00:00Z"); // 9h span
    expect(punchHours(start, end, 3600)).toBe(8); // 1h break
  });

  it("excludes a break still open at clock-out", () => {
    const start = new Date("2026-07-27T01:00:00Z");
    const end = new Date("2026-07-27T10:00:00Z");
    const pausedAt = new Date("2026-07-27T09:30:00Z");
    expect(punchHours(start, end, 1800, pausedAt)).toBe(8); // 30m + 30m
  });
});

describe("break-aware totals", () => {
  it("totalHoursOf subtracts breaks", () => {
    const punches = [
      { clockIn: new Date("2026-07-27T01:00:00Z"), clockOut: new Date("2026-07-27T10:00:00Z"), breakSeconds: 3600, pausedAt: null },
      { clockIn: new Date("2026-07-28T01:00:00Z"), clockOut: new Date("2026-07-28T05:00:00Z") },
    ];
    expect(totalHoursOf(punches)).toBe(12);
  });

  it("toPunchDto exposes pausedAt only while open", () => {
    const base = { id: "p", date: new Date("2026-07-27T00:00:00Z"), clockIn: new Date("2026-07-27T01:00:00Z"), breakSeconds: 60 };
    const pausedAt = new Date("2026-07-27T03:00:00Z");
    expect(toPunchDto({ ...base, clockOut: null, pausedAt }).pausedAt).toBe(pausedAt.toISOString());
    const done = toPunchDto({ ...base, clockOut: new Date("2026-07-27T05:00:00Z"), pausedAt: null });
    expect(done.pausedAt).toBeNull();
    expect(done.breakSeconds).toBe(60);
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
      pausedAt: null,
      breakSeconds: 0,
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

describe("monthRange", () => {
  it("returns a half-open UTC range for the month", () => {
    const r = monthRange("2026-02");
    expect(r.month).toBe("2026-02");
    expect(r.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rolls December over into the next year", () => {
    const r = monthRange("2026-12");
    expect(r.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("falls back to the current month for bad input", () => {
    expect(monthRange("2026-13").month).toMatch(/^\d{4}-\d{2}$/);
    expect(monthRange(null).month).toBe(monthRange(undefined).month);
  });
});

describe("totalHoursOf", () => {
  it("sums completed punches and ignores open ones", () => {
    const total = totalHoursOf([
      { clockIn: new Date("2026-07-27T01:00:00Z"), clockOut: new Date("2026-07-27T09:30:00Z") },
      { clockIn: new Date("2026-07-28T01:00:00Z"), clockOut: new Date("2026-07-28T05:15:00Z") },
      { clockIn: new Date("2026-07-29T01:00:00Z"), clockOut: null },
    ]);
    expect(total).toBe(12.75);
  });
});
