import { describe, expect, it } from "vitest";
import { isOffDayFor, nplDaysOfRequest, paidBackSuffix, paybackProblem, type PaybackCheck } from "@/lib/npl-payback";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("nplDaysOfRequest", () => {
  it("lists one full day for a single-day request", () => {
    expect(nplDaysOfRequest({ startDate: d("2026-11-02"), endDate: d("2026-11-02"), days: 1 })).toEqual([{ date: "2026-11-02", days: 1 }]);
  });
  it("keeps a half day at 0.5", () => {
    expect(nplDaysOfRequest({ startDate: d("2026-11-02"), endDate: d("2026-11-02"), days: 0.5 })).toEqual([{ date: "2026-11-02", days: 0.5 }]);
  });
  it("skips weekends and public holidays, and never exceeds the charged days", () => {
    // Fri 6 Nov – Tue 10 Nov, Mon 9 Nov a holiday → Fri + Tue
    const days = nplDaysOfRequest({ startDate: d("2026-11-06"), endDate: d("2026-11-10"), days: 2 }, new Set(["2026-11-09"]));
    expect(days).toEqual([{ date: "2026-11-06", days: 1 }, { date: "2026-11-10", days: 1 }]);
    const half = nplDaysOfRequest({ startDate: d("2026-11-02"), endDate: d("2026-11-03"), days: 1.5 });
    expect(half).toEqual([{ date: "2026-11-02", days: 1 }, { date: "2026-11-03", days: 0.5 }]);
  });
});

describe("isOffDayFor", () => {
  it("treats Sat/Sun as off days by default and a public holiday as an off day", () => {
    expect(isOffDayFor(null, "2026-11-07")).toBe(true); // Sat
    expect(isOffDayFor(null, "2026-11-04")).toBe(false); // Wed
    expect(isOffDayFor(null, "2026-11-04", new Set(["2026-11-04"]))).toBe(true);
  });
  it("follows an intern's own workdays", () => {
    expect(isOffDayFor([2, 3, 4, 5, 6], "2026-11-07")).toBe(false); // works Saturdays
    expect(isOffDayFor([2, 3, 4, 5, 6], "2026-11-02")).toBe(true); // Monday off
  });
});

describe("paybackProblem", () => {
  const ok: PaybackCheck = {
    days: 1, nplDay: { date: "2026-11-02", days: 1 }, alreadyClaimed: 0, workDate: "2026-11-07",
    workdays: [1, 2, 3, 4, 5], holidays: new Set(), workDateClaimed: 0, offInLieuOnWorkDate: false,
  };
  it("accepts an off day worked for an approved No Pay Leave day", () => {
    expect(paybackProblem(ok)).toBeNull();
  });
  it("rejects a date that is not a No Pay Leave day", () => {
    expect(paybackProblem({ ...ok, nplDay: undefined })).toMatch(/not one of your approved/);
  });
  it("rejects a normal working day", () => {
    expect(paybackProblem({ ...ok, workDate: "2026-11-04" })).toMatch(/normal working days/);
  });
  it("rejects paying back the same day twice, or more than is left", () => {
    expect(paybackProblem({ ...ok, alreadyClaimed: 1 })).toMatch(/already been paid back/);
    expect(paybackProblem({ ...ok, alreadyClaimed: 0.5 })).toMatch(/Only half day/);
    expect(paybackProblem({ ...ok, days: 0.5, alreadyClaimed: 0.5 })).toBeNull();
  });
  it("rejects an off day already used, or already counted for Off In Lieu", () => {
    expect(paybackProblem({ ...ok, workDateClaimed: 1 })).toMatch(/already used/);
    expect(paybackProblem({ ...ok, offInLieuOnWorkDate: true })).toMatch(/Off In Lieu/);
  });
  it("rejects an off day in another year", () => {
    expect(paybackProblem({ ...ok, workDate: "2027-01-02" })).toMatch(/same year/);
  });
});

describe("paidBackSuffix", () => {
  it("marks full and partial paybacks", () => {
    expect(paidBackSuffix(0, 1)).toBe("");
    expect(paidBackSuffix(1, 1)).toBe(" ✅ Paid back");
    expect(paidBackSuffix(1, 3)).toBe(" (1 of 3 days paid back)");
  });
});
