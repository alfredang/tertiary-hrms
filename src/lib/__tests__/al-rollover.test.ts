import { describe, expect, it } from "vitest";
import { alCarryForward } from "../al-rollover";

describe("AL carry forward: one year only (Alfred, 24 Nov 2026)", () => {
  it("carries the unused part of the year's own prorated AL", () => {
    expect(alCarryForward({ earned: 14, used: 10, pending: 0, carriedOver: 0 })).toBe(4);
  });

  it("uses carried-in days first; what is left of them lapses", () => {
    // 3 carried in, 2 taken → those 2 come from the carried days; 1 carried day lapses; all 14 own days carry.
    expect(alCarryForward({ earned: 14, used: 2, pending: 0, carriedOver: 3 })).toBe(14);
    // 3 carried in, 8 taken → 3 carried + 5 own; 9 own days left.
    expect(alCarryForward({ earned: 14, used: 8, pending: 0, carriedOver: 3 })).toBe(9);
  });

  it("counts pending as used, never carries a negative, and honours the cap", () => {
    expect(alCarryForward({ earned: 5, used: 4, pending: 2, carriedOver: 0 })).toBe(0);
    expect(alCarryForward({ earned: 14, used: 0, pending: 0, carriedOver: 0, maxCarry: 4 })).toBe(4);
  });
});
