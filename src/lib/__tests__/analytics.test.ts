import { describe, expect, it } from "vitest";
import { headcountByMonth, lastMonths } from "@/lib/analytics";
import { niceCeil } from "@/components/dashboard/bar-chart";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("lastMonths", () => {
  it("returns 12 months ending with the current one, oldest first", () => {
    const m = lastMonths(d("2026-11-20"));
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ key: "2025-12", year: 2025 });
    expect(m[11]).toMatchObject({ key: "2026-11", label: "Nov", year: 2026 });
  });
  it("uses Singapore time at a month boundary", () => {
    // 30 Nov 18:00 UTC is already 1 Dec in Singapore.
    expect(lastMonths(new Date("2026-11-30T18:00:00Z"), 3).map((x) => x.key)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});

describe("headcountByMonth", () => {
  const months = lastMonths(d("2026-11-20"), 3); // Sep, Oct, Nov
  const now = d("2026-11-20");
  it("counts people employed on the last day of the month, split staff and interns", () => {
    const rows = headcountByMonth(months, [
      { startDate: d("2024-01-01"), endDate: null, intern: false },
      { startDate: d("2026-10-05"), endDate: null, intern: true }, // joins in Oct
      { startDate: d("2026-06-01"), endDate: d("2026-10-15"), intern: true }, // leaves mid Oct
      { startDate: d("2026-12-01"), endDate: null, intern: false }, // not started yet
      { startDate: null, endDate: null, intern: false }, // no start date: not counted
    ], now);
    expect(rows).toEqual([
      { month: "2026-09", staff: 1, interns: 1 },
      { month: "2026-10", staff: 1, interns: 1 },
      { month: "2026-11", staff: 1, interns: 1 },
    ]);
  });
  it("uses today, not the month end, for the current month", () => {
    const rows = headcountByMonth(months, [{ startDate: d("2026-11-25"), endDate: null, intern: false }], now);
    expect(rows[2].staff).toBe(0);
  });
});

describe("niceCeil", () => {
  it("keeps the top and the midpoint round", () => {
    expect(niceCeil(3)).toBe(4);
    expect(niceCeil(9)).toBe(10);
    expect(niceCeil(23)).toBe(30);
    expect(niceCeil(727_000)).toBe(800_000);
  });
});
