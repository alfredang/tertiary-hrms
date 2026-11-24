import { describe, it, expect } from "vitest";
import {
  AL_DEFAULT_DAYS,
  AL_INTERN_DEFAULT_DAYS,
  isPartTimeEmployment,
  nplAnnualCap,
  partTimeHasNoLeave,
  NPL_ANNUAL_CAP_DAYS,
  alApprovalShortfall,
  applyLeaveCap,
  completedMonthsBetween,
  countSingleDayMcs,
  countWeekendAdjacentMcs,
  evaluateAlRequest,
  evaluateNplRequest,
  floorToHalf,
  isInternRoles,
  isMedicalLeaveCode,
  mcAnnualEntitlement,
  monthsEmployedInYear,
  monthsServedThisYear,
  nplStatus,
  prorateByMonths,
  splitAlExcess,
} from "@/lib/leave-policy";
import { computeAlFullEntitlement, computeYearlyEntitlement, prorateLeave } from "@/lib/utils";

const NOV_9 = new Date(2026, 10, 9, 10);

describe("Rule 1 — months served this year (completed months only)", () => {
  it("joined 1 Sep, today 9 Nov → Sep + Oct = 2 months (the user's example)", () => {
    expect(monthsServedThisYear(new Date(2026, 8, 1), NOV_9)).toBe(2);
  });

  it("joined mid-month: 20 Sep → only 20 Sep–19 Oct is complete by 9 Nov", () => {
    expect(monthsServedThisYear(new Date(2026, 8, 20), NOV_9)).toBe(1);
  });

  it("joined before this year → completed months since 1 Jan (Jan–Oct = 10)", () => {
    expect(monthsServedThisYear(new Date(2023, 4, 17), NOV_9)).toBe(10);
    expect(monthsServedThisYear(null, NOV_9)).toBe(10);
  });

  it("a partial month counts as 0", () => {
    expect(monthsServedThisYear(new Date(2026, 10, 1), NOV_9)).toBe(0);
    expect(monthsServedThisYear(new Date(2026, 10, 1), new Date(2026, 11, 1))).toBe(1);
  });

  it("stops at the contract end date", () => {
    // 1 Mar – 15 Jun: Mar, Apr, May complete; 1–15 Jun is partial
    expect(monthsServedThisYear(new Date(2026, 2, 1), NOV_9, new Date(2026, 5, 15))).toBe(3);
    // ends on the last day of a month → that month counts
    expect(monthsServedThisYear(new Date(2026, 2, 1), NOV_9, new Date(2026, 5, 30))).toBe(4);
  });

  it("completedMonthsBetween clamps month-end anniversaries", () => {
    expect(completedMonthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 28))).toBe(1);
    expect(completedMonthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 27))).toBe(0);
  });

  it("months employed in the full year (basis of the full-year entitlement)", () => {
    expect(monthsEmployedInYear(new Date(2026, 8, 1), 2026)).toBe(4); // Sep–Dec
    expect(monthsEmployedInYear(new Date(2020, 0, 1), 2026)).toBe(12);
    expect(monthsEmployedInYear(new Date(2026, 9, 7), 2026, new Date(2027, 1, 24))).toBe(2); // 7 Oct–6 Dec
  });
});

describe("Rule 1 — AL and MC prorated strictly: entitlement × months / 12, down to a whole day", () => {
  it("AL 7 × 2/12 = 1.17 → 1 for the Sep joiner on 9 Nov", () => {
    expect(prorateLeave(7, new Date(2026, 8, 1), null, true, NOV_9)).toBe(1);
  });

  it("MC 14 × 2/12 = 2.33 → 2 for the same joiner", () => {
    expect(prorateLeave(14, new Date(2026, 8, 1), null, false, NOV_9)).toBe(2);
  });

  it("MC has no 'long contract gets the full year' shortcut", () => {
    expect(prorateLeave(14, new Date(2026, 8, 1), 12, false, NOV_9)).toBe(2);
  });

  it("existing staff on 9 Nov: AL 7 × 10/12 = 5.83 → 5 (whole days)", () => {
    expect(prorateLeave(7, new Date(2024, 0, 1), null, true, NOV_9)).toBe(5);
  });

  it("the per-employee leave-days cap only lowers AL", () => {
    expect(prorateLeave(7, new Date(2024, 0, 1), 3, true, NOV_9)).toBe(3);
    expect(applyLeaveCap(5.5, 7, 12)).toBe(5.5);
  });

  it("full-year AL entitlement prorates over the months employed this year", () => {
    expect(computeAlFullEntitlement(new Date(2026, 8, 1), null, 7, null, 2026)).toBe(2); // 7 × 4/12 = 2.33
    expect(computeAlFullEntitlement(new Date(2020, 0, 1), null, 7, null, 2026)).toBe(7);
  });

  it("floorToHalf never rounds up", () => {
    expect(floorToHalf(1.99)).toBe(1.5);
    expect(floorToHalf(7)).toBe(7);
    expect(prorateByMonths(7, 12)).toBe(7);
    expect(prorateByMonths(7, 0)).toBe(0);
  });
});

describe("Rule 2 — AL 7 staff / 3 interns; excess AL must be No Pay Leave", () => {
  it("company AL: staff 7 days/year, interns 3 (Alfred, 24 Nov 2026)", () => {
    expect(AL_DEFAULT_DAYS).toBe(7);
    expect(AL_INTERN_DEFAULT_DAYS).toBe(3);
    expect(computeYearlyEntitlement(new Date())).toBe(7);
  });

  it("flags days beyond the earned balance as excess", () => {
    const r = evaluateAlRequest({ days: 5, earnedAvailable: 1, otAvailable: 0, otRequested: 0 });
    expect(r).toMatchObject({ ok: false, excessDays: 4, coverable: 1 });
  });

  it("Off In Lieu reduces the excess; beyond it it's still NPL", () => {
    const r = evaluateAlRequest({ days: 5, earnedAvailable: 1, otAvailable: 1, otRequested: 3 });
    expect(r).toMatchObject({ ok: false, otDaysUsed: 1, excessDays: 3, coverable: 2 });
  });

  it("is ok when the earned balance covers it", () => {
    const r = evaluateAlRequest({ days: 2, earnedAvailable: 2, otAvailable: 0, otRequested: 0 });
    expect(r).toMatchObject({ ok: true, excessDays: 0, coverable: 2 });
  });

  it("HARD RULE: no AL left → no AL at all, only No Pay Leave (Alfred, 24 Nov 2026)", () => {
    expect(evaluateAlRequest({ days: 0.5, earnedAvailable: 0, otAvailable: 0, otRequested: 0 })).toMatchObject({ ok: false, excessDays: 0.5 });
    // A balance already below zero never counts as cover.
    expect(evaluateAlRequest({ days: 1, earnedAvailable: -2, otAvailable: 0, otRequested: 0 })).toMatchObject({ ok: false, excessDays: 1 });
  });

  it("HARD RULE at approval: approving never takes AL below zero", () => {
    expect(alApprovalShortfall({ earned: 5, carriedOver: 0, usedBefore: 3, alDays: 2 })).toBe(0);
    expect(alApprovalShortfall({ earned: 5, carriedOver: 0, usedBefore: 3, alDays: 3 })).toBe(1);
    expect(alApprovalShortfall({ earned: 4, carriedOver: 0, usedBefore: 5.5, alDays: 1 })).toBe(1);
    expect(alApprovalShortfall({ earned: 4, carriedOver: 2, usedBefore: 5, alDays: 1 })).toBe(0);
  });

  it("AL prorates to a whole day: 7 days × 9 months / 12 = 5.25 → 5 (Alfred, 24 Nov 2026)", () => {
    expect(prorateByMonths(7, 9)).toBe(5);
    expect(prorateByMonths(7, 10)).toBe(5);
    expect(prorateByMonths(7, 11)).toBe(6);
    expect(prorateByMonths(7, 12)).toBe(7);
    expect(prorateByMonths(7, 1)).toBe(0);
  });
});

describe("Rule 5 — part-time staff have no AL, MC or No Pay Leave (Alfred, 24 Nov 2026)", () => {
  it("caps No Pay Leave at 0 for part-time staff, 14 for everyone else", () => {
    expect(nplAnnualCap(true)).toBe(0);
    expect(nplAnnualCap(false)).toBe(14);
    expect(isPartTimeEmployment("PART_TIME")).toBe(true);
    expect(isPartTimeEmployment("FULL_TIME")).toBe(false);
  });

  it("blocks AL, every MC code and NPL, but not compassionate leave", () => {
    for (const c of ["AL", "MC", "SL", "MEDICAL", "NPL"]) expect(partTimeHasNoLeave(c)).toBe(true);
    expect(partTimeHasNoLeave("CL")).toBe(false);
  });
});

describe("Rule 3 — No Pay Leave cap: 14 days/year, not prorated", () => {
  it("cap is 14", () => expect(NPL_ANNUAL_CAP_DAYS).toBe(14));

  it("remaining = cap − taken − pending, never negative", () => {
    expect(nplStatus(3.5, 2, 1)).toEqual({ cap: 3.5, used: 2, pending: 1, remaining: 0.5 });
    expect(nplStatus(3.5, 5, 0).remaining).toBe(0);
  });

  it("evaluateNplRequest blocks a request beyond what is left", () => {
    expect(evaluateNplRequest(1, nplStatus(3.5, 2, 1)).ok).toBe(false);
    expect(evaluateNplRequest(0.5, nplStatus(3.5, 2, 1)).ok).toBe(true);
  });
});

describe("Rule 4 — interns have no paid MC", () => {
  it("interns are roles exactly ['INTERN']", () => {
    expect(isInternRoles(["INTERN"])).toBe(true);
    expect(isInternRoles(["ADMIN", "INTERN"])).toBe(false);
    expect(isInternRoles(["STAFF"])).toBe(false);
    expect(isInternRoles([])).toBe(false);
    expect(isInternRoles(null)).toBe(false);
  });

  it("intern MC entitlement is 0; staff keep theirs", () => {
    expect(mcAnnualEntitlement(14, true)).toBe(0);
    expect(mcAnnualEntitlement(14, false)).toBe(14);
    expect(prorateLeave(mcAnnualEntitlement(14, true), new Date(2026, 0, 1), null, false, NOV_9)).toBe(0);
  });

  it("recognises every medical leave code", () => {
    expect(["MC", "SL", "MEDICAL"].every(isMedicalLeaveCode)).toBe(true);
    expect(isMedicalLeaveCode("NPL")).toBe(false);
  });
});

describe("MC pattern helpers", () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const mcs = [
    { startDate: d("2026-11-02"), endDate: d("2026-11-02"), days: 1 }, // Mon
    { startDate: d("2026-11-06"), endDate: d("2026-11-06"), days: 1 }, // Fri
    { startDate: d("2026-11-11"), endDate: d("2026-11-12"), days: 2 }, // Wed–Thu
  ];
  it("counts Monday-start / Friday-end MCs", () => expect(countWeekendAdjacentMcs(mcs)).toBe(2));
  it("counts single-day MCs", () => expect(countSingleDayMcs(mcs)).toBe(2));
});

describe("splitAlExcess", () => {
  it("puts the covered working days in AL and the rest in No Pay Leave", () => {
    // 11–31 Dec 2026: 14 working days (Christmas skipped); AL covers 8.
    const s = splitAlExcess({ startDate: "2026-12-11", endDate: "2026-12-31", totalDays: 14, coverable: 8, halfDayPosition: null, holidays: ["2026-12-25"] });
    expect(s).toEqual({
      al: { startDate: "2026-12-11", endDate: "2026-12-22", days: 8, halfDayPosition: null },
      npl: { startDate: "2026-12-23", endDate: "2026-12-31", days: 6 },
    });
  });

  it("keeps the AL part on whole days when coverage ends on a half", () => {
    const s = splitAlExcess({ startDate: "2026-12-07", endDate: "2026-12-11", totalDays: 5, coverable: 2.5, halfDayPosition: null });
    expect(s?.al).toMatchObject({ endDate: "2026-12-08", days: 2 });
    expect(s?.npl).toMatchObject({ startDate: "2026-12-09", days: 3 });
  });

  it("carries a first-day half into AL and a last-day half into NPL", () => {
    const first = splitAlExcess({ startDate: "2026-12-07", endDate: "2026-12-11", totalDays: 4.5, coverable: 2.5, halfDayPosition: "first" });
    expect(first?.al).toEqual({ startDate: "2026-12-07", endDate: "2026-12-09", days: 2.5, halfDayPosition: "first" });
    expect(first?.npl.days).toBe(2);
    const last = splitAlExcess({ startDate: "2026-12-07", endDate: "2026-12-11", totalDays: 4.5, coverable: 2, halfDayPosition: "last" });
    expect(last?.al).toMatchObject({ days: 2, halfDayPosition: null });
    expect(last?.npl).toEqual({ startDate: "2026-12-09", endDate: "2026-12-11", days: 2.5 });
  });

  it("returns null when there is nothing to split", () => {
    expect(splitAlExcess({ startDate: "2026-12-07", endDate: "2026-12-11", totalDays: 5, coverable: 5, halfDayPosition: null })).toBeNull();
    expect(splitAlExcess({ startDate: "2026-12-07", endDate: "2026-12-11", totalDays: 5, coverable: 0.5, halfDayPosition: null })).toBeNull();
  });
});
