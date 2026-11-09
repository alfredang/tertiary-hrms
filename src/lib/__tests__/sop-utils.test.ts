import { describe, expect, it } from "vitest";
import { SOPS, SOP_CATEGORIES } from "@/lib/sop-data";
import { filterSops, groupSopsByCategory, sopFromRow, sopToRowData, toSopListItem } from "@/lib/sop-utils";

const items = SOPS.map(toSopListItem);

describe("SOP data", () => {
  it("has unique slugs, a known category and at least one step per SOP", () => {
    const categories = new Set<string>(SOP_CATEGORIES.map((c) => c.name));
    expect(new Set(SOPS.map((s) => s.slug)).size).toBe(SOPS.length);
    for (const s of SOPS) {
      expect(categories.has(s.category), s.slug).toBe(true);
      expect(s.steps.length, s.slug).toBeGreaterThan(0);
      expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("keeps the UTAP Application SOP", () => {
    const utap = SOPS.find((s) => s.slug === "utap-application");
    expect(utap?.category).toBe("Funding & Grants");
    expect(utap?.steps).toHaveLength(6);
  });

  it("contains no phone numbers or NRIC numbers", () => {
    const text = JSON.stringify(SOPS);
    expect(text).not.toMatch(/\b[689]\d{3}\s?\d{4}\b/); // SG phone numbers
    expect(text).not.toMatch(/\b[STFGM]\d{7}[A-Z]\b/); // NRIC / FIN
  });
});

describe("groupSopsByCategory", () => {
  it("follows the fixed category order and omits empty groups", () => {
    const groups = groupSopsByCategory(items);
    const order = SOP_CATEGORIES.map((c) => c.name as string).filter((c) => items.some((i) => i.category === c));
    expect(groups.map((g) => g.category)).toEqual(order);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(items.length);
  });

  it("sorts by sortOrder then title, and puts unknown categories last", () => {
    const groups = groupSopsByCategory([
      { category: "Zeta", sortOrder: 0, title: "Z" },
      { category: "Finance", sortOrder: 2, title: "B" },
      { category: "Finance", sortOrder: 1, title: "C" },
      { category: "Finance", sortOrder: 1, title: "A" },
      { category: "Operations", sortOrder: 0, title: "O" },
    ]);
    expect(groups.map((g) => g.category)).toEqual(["Operations", "Finance", "Zeta"]);
    expect(groups[1].items.map((i) => i.title)).toEqual(["A", "C", "B"]);
    expect(groups[1].description).toBeTruthy();
    expect(groups[2].description).toBeUndefined();
  });
});

describe("filterSops", () => {
  it("returns everything for an empty query", () => {
    expect(filterSops(items, "   ")).toHaveLength(items.length);
  });

  it("matches title, summary and step text case-insensitively", () => {
    expect(filterSops(items, "REFUND").map((i) => i.slug)).toContain("refund-request");
    // "Appeal Panel" only appears inside the assessment-appeal steps
    expect(filterSops(items, "appeal panel").map((i) => i.slug)).toContain("assessment-appeal");
  });

  it("requires every term to match", () => {
    const both = filterSops(items, "singpass zoom").map((i) => i.slug);
    expect(both).toContain("synchronous-e-learning-class");
    expect(filterSops(items, "singpass xyzzy-no-match")).toHaveLength(0);
  });
});

describe("DB row round-trip", () => {
  it("sopFromRow(sopToRowData(sop)) gives the SOP back", () => {
    const sop = SOPS.find((s) => s.slug === "utap-application")!;
    const data = sopToRowData(sop);
    const back = sopFromRow({ slug: sop.slug, ...data, updatedAt: new Date("2026-11-10T00:00:00Z") });
    expect(back.steps).toEqual(JSON.parse(JSON.stringify(sop.steps)));
    expect(back.references).toEqual(JSON.parse(JSON.stringify(sop.references)));
    expect(back.triggers).toEqual(sop.triggers);
    expect(back.updatedAt).toBe("2026-11-10T00:00:00.000Z");
  });

  it("tolerates malformed JSON and the legacy step shape", () => {
    const back = sopFromRow({
      slug: "x",
      title: "X",
      category: "Operations",
      summary: "s",
      purpose: null,
      scope: null,
      owner: null,
      triggers: "not-an-array",
      steps: [null, { nope: 1 }, { title: "Legacy", summary: "old summary", details: ["a", 3, ""] }],
      references: [{ label: "only label" }],
      source: null,
      sortOrder: 0,
      updatedAt: new Date(),
    });
    expect(back.triggers).toBeUndefined();
    expect(back.references).toBeUndefined();
    expect(back.steps).toEqual([
      { title: "Legacy", detail: "old summary", items: ["a"], owner: undefined, timing: undefined, note: undefined, links: undefined },
    ]);
  });
});
