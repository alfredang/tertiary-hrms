import { describe, expect, it } from "vitest";
import { dayCount, leaveDetails, timeOffDetails } from "@/lib/calendar-details";

const at = (d: string) => new Date(`${d}T00:00:00+08:00`);

describe("leaveDetails", () => {
  it("shows the MC reason and whether an MC was uploaded", () => {
    expect(
      leaveDetails({
        leaveTypeName: "Medical Leave", startDate: at("2026-11-02"), endDate: at("2026-11-02"), days: 1,
        dayType: "FULL_DAY", reason: "  Fever and\nflu ", hasDocument: true, medical: true,
      }),
    ).toEqual([
      { label: "Type", value: "Medical Leave" },
      { label: "Dates", value: "2 Nov 2026" },
      { label: "Days", value: "1 day" },
      { label: "Reason", value: "Fever and flu" },
      { label: "MC", value: "Uploaded" },
    ]);
  });
  it("shows a date range, half days and a missing reason", () => {
    const d = leaveDetails({
      leaveTypeName: "Annual Leave", startDate: at("2026-11-05"), endDate: at("2026-11-11"), days: 4.5,
      halfDayPosition: "last", reason: null,
    });
    expect(d).toEqual([
      { label: "Type", value: "Annual Leave" },
      { label: "Dates", value: "5 Nov 2026 – 11 Nov 2026" },
      { label: "Days", value: "4.5 days (half on last day)" },
      { label: "Reason", value: "No reason given" },
    ]);
    expect(leaveDetails({ leaveTypeName: "AL", startDate: at("2026-11-05"), endDate: at("2026-11-05"), days: 0.5, dayType: "AM_HALF" })[2].value)
      .toBe("0.5 day (AM half)");
  });
});

describe("timeOffDetails", () => {
  it("shows time, hours and reason", () => {
    expect(timeOffDetails({ offDay: false, startTime: "14:00", endTime: "16:00", hours: 2, reasonLabel: "Others", reasonDetail: "Dentist" })).toEqual([
      { label: "Time", value: "14:00 – 16:00" },
      { label: "Hours", value: "2 h" },
      { label: "Reason", value: "Others: Dentist" },
    ]);
  });
  it("shows an off day as a full day", () => {
    expect(timeOffDetails({ offDay: true, startTime: "00:00", endTime: "23:59", hours: 0, reasonLabel: "Off Day" })).toEqual([
      { label: "Type", value: "Off Day (full day)" },
    ]);
  });
});

describe("dayCount", () => {
  it("pluralises", () => {
    expect([dayCount(0.5), dayCount(1), dayCount(2)]).toEqual(["0.5 day", "1 day", "2 days"]);
  });
});

describe("leaveDetails with a payback", () => {
  it("adds a Paid back line for a No Pay Leave day made up by working an off day", () => {
    const lines = leaveDetails({
      leaveTypeName: "No Pay Leave", startDate: new Date("2026-11-02T00:00:00Z"), endDate: new Date("2026-11-02T00:00:00Z"), days: 1,
      paybacks: [{ nplDate: new Date("2026-11-02T00:00:00Z"), workDate: new Date("2026-11-07T00:00:00Z"), days: 1 }],
    });
    expect(lines.at(-1)).toEqual({ label: "Paid back", value: "2 Nov 2026: worked Sat, 7 Nov 2026" });
  });
});
