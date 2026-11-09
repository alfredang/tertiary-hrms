import { describe, it, expect } from "vitest";
import {
  applyCorrection,
  findMissedPunches,
  hoursBetween,
  isScheduledWorkday,
  sgtInstant,
  validateCorrection,
  weekStart,
} from "@/lib/attendance-policy";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = d("2026-11-09"); // Monday
const NOW = new Date("2026-11-09T13:00:00.000Z"); // 21:00 SGT

describe("Rule 5 — missed punches", () => {
  const interns = [
    { id: "a", workdays: [1, 2, 3, 4, 5] },
    { id: "b", workdays: [1, 2, 3, 4, 5] },
    { id: "c", workdays: [1, 2, 3, 4, 5] },
    { id: "d", workdays: [2, 3, 4, 5, 6] }, // doesn't work Mondays
    { id: "e", workdays: [1, 2, 3, 4, 5], startDate: d("2026-11-16") }, // not started yet
  ];
  const punches = [
    { employeeId: "a", date: TODAY, clockIn: new Date("2026-11-09T01:00:00Z"), clockOut: null },
    { employeeId: "b", date: TODAY, clockIn: new Date("2026-11-09T01:00:00Z"), clockOut: new Date("2026-11-09T10:00:00Z") },
  ];
  const base = { date: TODAY, interns, punches, onLeave: new Set<string>(), isPublicHoliday: false, corrected: new Set<string>() };

  it("finds a forgotten clock-out and a missing clock-in on a workday", () => {
    expect(findMissedPunches(base)).toEqual([
      { employeeId: "a", date: "2026-11-09", kind: "NO_CLOCK_OUT" },
      { employeeId: "c", date: "2026-11-09", kind: "NO_CLOCK_IN" },
    ]);
  });

  it("skips leave, public holidays and days already corrected — but a forgotten clock-out still counts on a holiday", () => {
    expect(findMissedPunches({ ...base, onLeave: new Set(["c"]) }).map((m) => m.employeeId)).toEqual(["a"]);
    expect(findMissedPunches({ ...base, isPublicHoliday: true }).map((m) => m.employeeId)).toEqual(["a"]);
    expect(findMissedPunches({ ...base, corrected: new Set(["a|2026-11-09", "c|2026-11-09"]) })).toEqual([]);
  });

  it("uses each intern's own workdays (ISO 1=Mon … 7=Sun)", () => {
    expect(isScheduledWorkday([1, 2, 4, 5, 7], d("2026-11-08"))).toBe(true); // Sunday
    expect(isScheduledWorkday([1, 2, 3, 4, 5], d("2026-11-08"))).toBe(false);
    expect(isScheduledWorkday([], d("2026-11-09"))).toBe(true); // default Mon–Fri
  });
});

describe("Rule 5 — missing-punch corrections", () => {
  it("accepts a missing clock-out after the recorded clock-in", () => {
    const v = validateCorrection(
      { kind: "CLOCK_OUT", date: "2026-11-06", clockOutTime: "18:00", reason: "Forgot to clock out" },
      { clockIn: sgtInstant("2026-11-06", "09:00"), clockOut: null },
      TODAY,
      NOW,
    );
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.clockOut?.toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });

  it("rejects clock-out before clock-in, future days/times, stale dates and missing reasons", () => {
    const punch = { clockIn: sgtInstant("2026-11-06", "09:00"), clockOut: null };
    expect(validateCorrection({ kind: "CLOCK_OUT", date: "2026-11-06", clockOutTime: "08:00", reason: "x x x" }, punch, TODAY, NOW).ok).toBe(false);
    expect(validateCorrection({ kind: "BOTH", date: "2026-11-10", clockInTime: "09:00", clockOutTime: "18:00", reason: "later" }, null, TODAY, NOW).ok).toBe(false);
    expect(validateCorrection({ kind: "BOTH", date: "2026-11-09", clockInTime: "09:00", clockOutTime: "23:00", reason: "future time" }, null, TODAY, NOW).ok).toBe(false);
    expect(validateCorrection({ kind: "BOTH", date: "2026-09-01", clockInTime: "09:00", clockOutTime: "18:00", reason: "too old" }, null, TODAY, NOW).ok).toBe(false);
    expect(validateCorrection({ kind: "BOTH", date: "2026-11-06", clockInTime: "09:00", clockOutTime: "18:00", reason: "" }, null, TODAY, NOW).ok).toBe(false);
  });

  it("needs 'Both' when there is no clock-in to attach a clock-out to", () => {
    const v = validateCorrection({ kind: "CLOCK_OUT", date: "2026-11-06", clockOutTime: "18:00", reason: "forgot" }, null, TODAY, NOW);
    expect(v.ok).toBe(false);
  });

  it("refuses to overwrite an existing punch", () => {
    const full = { clockIn: sgtInstant("2026-11-06", "09:00"), clockOut: sgtInstant("2026-11-06", "18:00") };
    expect(validateCorrection({ kind: "CLOCK_OUT", date: "2026-11-06", clockOutTime: "19:00", reason: "change" }, full, TODAY, NOW).ok).toBe(false);
    expect(validateCorrection({ kind: "CLOCK_IN", date: "2026-11-06", clockInTime: "08:00", reason: "change" }, full, TODAY, NOW).ok).toBe(false);
  });

  it("applyCorrection fills only the requested side", () => {
    const inAt = new Date("2026-11-06T01:00:00Z");
    const outAt = new Date("2026-11-06T10:00:00Z");
    expect(applyCorrection({ clockIn: inAt, clockOut: null }, { requestedClockIn: null, requestedClockOut: outAt })).toEqual({ clockIn: inAt, clockOut: outAt });
  });
});

describe("Rule 6 — intern hours", () => {
  it("sums completed punches in a date range and ignores open ones", () => {
    const punches = [
      { date: d("2026-11-09"), clockIn: new Date("2026-11-09T01:00:00Z"), clockOut: new Date("2026-11-09T09:30:00Z") }, // 8.5h
      { date: d("2026-11-10"), clockIn: new Date("2026-11-10T01:00:00Z"), clockOut: null },
      { date: d("2026-11-02"), clockIn: new Date("2026-11-02T01:00:00Z"), clockOut: new Date("2026-11-02T02:00:00Z") }, // last week
    ];
    const wk = weekStart(d("2026-11-11"));
    expect(wk.toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(hoursBetween(punches, wk, d("2026-11-16"))).toBe(8.5);
  });
});
