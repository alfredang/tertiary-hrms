import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin-alerts", () => ({ notifyApprovers: vi.fn() }));

import { awayTodayMessage, birthdaysOn } from "@/lib/birthday-alerts";

// Dates of birth are stored as the Singapore day (UTC 16:00 of the day before, or UTC midnight).
const p = (name: string, dob: string | null) => ({ name, dateOfBirth: dob ? new Date(dob) : null });

describe("birthdaysOn", () => {
  const people = [p("A", "1990-11-20T00:00:00Z"), p("B", "1985-11-19T16:00:00Z"), p("C", "1999-03-01T00:00:00Z"), p("D", null), p("E", "2000-02-29T00:00:00Z")];
  it("matches the day and month in Singapore time, whatever the year", () => {
    expect(birthdaysOn(people, "2026-11-20").map((x) => x.name)).toEqual(["A", "B"]);
  });
  it("keeps a 29 Feb birthday on 28 Feb in a non-leap year and on 29 Feb in a leap year", () => {
    expect(birthdaysOn(people, "2027-02-28").map((x) => x.name)).toEqual(["E"]);
    expect(birthdaysOn(people, "2028-02-28").map((x) => x.name)).toEqual([]);
    expect(birthdaysOn(people, "2028-02-29").map((x) => x.name)).toEqual(["E"]);
  });
});

describe("awayTodayMessage", () => {
  it("lists MC first, then leave, then No Pay Leave", () => {
    expect(awayTodayMessage([
      { name: "B", leaveType: "No Pay Leave" }, { name: "A", leaveType: "Annual Leave" }, { name: "C", leaveType: "Medical Leave" },
    ])).toBe("Away today: C (Medical Leave), A (Annual Leave), B (No Pay Leave).");
  });
});
