import { describe, expect, it } from "vitest";
import { countTrainers, singaporePeriod, splitByDirection } from "@/lib/dashboard-kpis";

describe("countTrainers", () => {
  it("counts trainers, ACLP and non-ACLP, leaving applicants out", () => {
    expect(countTrainers([
      { status: "Active", trainingCerts: ["ACLP", "DACE"] },
      { status: "Active", trainingCerts: ["ACTA"] },
      { status: "Inactive", trainingCerts: [] },
      { status: "Applicant", trainingCerts: ["ACLP"] },
      { status: "Contacted", trainingCerts: [] },
    ])).toEqual({ total: 3, aclp: 1, nonAclp: 2 });
  });
});

describe("splitByDirection", () => {
  it("credits are income, debits are expenses, without float drift", () => {
    expect(splitByDirection([
      { direction: "CREDIT", _sum: { amount: "0.10" } },
      { direction: "CREDIT", _sum: { amount: "0.20" } },
      { direction: "DEBIT", _sum: { amount: "1234.56" } },
    ])).toEqual({ income: 0.3, expenses: 1234.56 });
  });
  it("is zero when nothing was imported", () => {
    expect(splitByDirection([])).toEqual({ income: 0, expenses: 0 });
    expect(splitByDirection([{ direction: "DEBIT", _sum: { amount: null } }])).toEqual({ income: 0, expenses: 0 });
  });
});

describe("singaporePeriod", () => {
  it("uses the Singapore month at a month boundary", () => {
    // 30 Nov 18:00 UTC is already 1 Dec in Singapore.
    const p = singaporePeriod(new Date("2026-11-30T18:00:00Z"));
    expect(p.monthStart.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(p.nextMonthStart.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(p.yearStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
