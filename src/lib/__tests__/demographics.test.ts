import { describe, expect, it } from "vitest";
import { AGE_GROUPS, ETHNIC_GROUPS, NOT_RECORDED, ageGroup, ageOn, countBy, ethnicLabel, wholePercents, type BreakdownPerson } from "@/lib/demographics";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-11-20");

describe("age", () => {
  it("counts whole years, changing on the birthday", () => {
    expect(ageOn(d("2001-11-21"), now)).toBe(24);
    expect(ageOn(d("2001-11-20"), now)).toBe(25);
  });
  it("puts people in the right group, and unknown or impossible dates in Not recorded", () => {
    expect(ageGroup(d("2001-11-21"), now)).toBe("Under 25");
    expect(ageGroup(d("2001-11-20"), now)).toBe("25–34");
    expect(ageGroup(d("1982-01-01"), now)).toBe("35–44");
    expect(ageGroup(d("1972-01-01"), now)).toBe("45–54");
    expect(ageGroup(d("1960-01-01"), now)).toBe("55 and over");
    expect(ageGroup(null, now)).toBe(NOT_RECORDED);
    expect(ageGroup(d("2030-01-01"), now)).toBe(NOT_RECORDED);
  });
});

describe("ethnic group", () => {
  it("keeps the listed groups, folds anything else into Others, and blank into Not recorded", () => {
    expect(ethnicLabel("Malay")).toBe("Malay");
    expect(ethnicLabel("Filipino")).toBe("Others");
    expect(ethnicLabel("")).toBe(NOT_RECORDED);
    expect(ethnicLabel(null)).toBe(NOT_RECORDED);
  });
});

describe("countBy", () => {
  const p = (gender: string, ageGroup: string, ethnicGroup: string): BreakdownPerson => ({ intern: false, gender, ageGroup, ethnicGroup });
  const people = [p("Male", "25–34", "Chinese"), p("Female", "25–34", NOT_RECORDED), p("Female", "Under 25", "Indian")];
  it("counts in the given order, drops empty slices, and puts Not recorded last", () => {
    expect(countBy(people, "gender", ["Male", "Female", "Other"])).toEqual([{ label: "Male", count: 1 }, { label: "Female", count: 2 }]);
    expect(countBy(people, "ageGroup", AGE_GROUPS).map((s) => s.label)).toEqual(["Under 25", "25–34"]);
    expect(countBy(people, "ethnicGroup", ETHNIC_GROUPS)).toEqual([
      { label: "Chinese", count: 1 }, { label: "Indian", count: 1 }, { label: NOT_RECORDED, count: 1 },
    ]);
  });
});

describe("wholePercents", () => {
  const sum = (a: number[]) => a.reduce((t, n) => t + n, 0);
  it("always adds up to 100", () => {
    for (const counts of [[1, 1, 1, 1, 1, 1], [1, 1, 1], [5, 9], [7, 1, 2, 4], [3, 3, 8], [8, 12], [10, 1, 2, 4, 3]]) {
      expect(sum(wholePercents(counts))).toBe(100);
    }
  });
  it("keeps exact shares and gives leftover points to the largest fractions", () => {
    expect(wholePercents([8, 12])).toEqual([40, 60]);
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([5, 9])).toEqual([36, 64]);
  });
  it("is all zeros when there is nobody", () => {
    expect(wholePercents([0, 0])).toEqual([0, 0]);
    expect(wholePercents([])).toEqual([]);
  });
});
