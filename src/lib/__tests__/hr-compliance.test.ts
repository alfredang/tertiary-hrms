import { describe, it, expect } from "vitest";
import { buildFindings, findingsEmailHtml, type InternAttendanceRow, type PersonLeaveRow } from "@/lib/hr-compliance";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function person(over: Partial<PersonLeaveRow> = {}): PersonLeaveRow {
  return {
    id: "p1",
    name: "Pat",
    employeeCode: "E0001",
    isIntern: false,
    al: { earned: 5.5, full: 7, carried: 0, used: 0, pending: 0, allowed: 7 },
    mc: { earned: 11.5, used: 0, pending: 0 },
    npl: { cap: 17.5, used: 0, pending: 0 },
    mcLeaves: [],
    deficitDays: 0,
    ...over,
  };
}

describe("Rule 7 — HR compliance findings", () => {
  it("no findings for a clean record", () => {
    expect(buildFindings([person()], [])).toEqual([]);
  });

  it("NPL nearing (≥80%) and over the prorated cap", () => {
    const near = buildFindings([person({ npl: { cap: 10, used: 7, pending: 1 } })], []);
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ category: "NPL", severity: "medium" });
    const over = buildFindings([person({ npl: { cap: 3.5, used: 3, pending: 1 } })], []);
    expect(over[0]).toMatchObject({ category: "NPL", severity: "high" });
  });

  it("MC above the prorated entitlement, and any paid MC by an intern", () => {
    expect(buildFindings([person({ mc: { earned: 2, used: 3, pending: 0 } })], [])[0].category).toBe("MC_EXCESS");
    const intern = buildFindings([person({ isIntern: true, mc: { earned: 0, used: 1, pending: 0 } })], []);
    expect(intern[0].message).toMatch(/interns' sick leave should be No Pay Leave/);
  });

  it("patterned MC: Mondays/Fridays and frequent single-day MCs", () => {
    const mcLeaves = [
      { startDate: d("2026-03-02"), endDate: d("2026-03-02"), days: 1 }, // Mon
      { startDate: d("2026-04-10"), endDate: d("2026-04-10"), days: 1 }, // Fri
      { startDate: d("2026-06-01"), endDate: d("2026-06-01"), days: 1 }, // Mon
      { startDate: d("2026-08-12"), endDate: d("2026-08-12"), days: 1 }, // Wed
    ];
    const f = buildFindings([person({ mcLeaves, mc: { earned: 11.5, used: 4, pending: 0 } })], []);
    expect(f.filter((x) => x.category === "MC_PATTERN").map((x) => x.message)).toEqual([
      "3 of 4 MCs this year fall on a Monday or Friday.",
      "4 single-day MCs this year.",
    ]);
  });

  it("AL beyond entitlement (and legacy deficits)", () => {
    const over = buildFindings([person({ al: { earned: 1, full: 2, carried: 0, used: 2, pending: 1, allowed: 2 } })], []);
    expect(over[0]).toMatchObject({ category: "AL_EXCESS", severity: "high" });
    const legacy = buildFindings([person({ deficitDays: 2 })], []);
    expect(legacy[0]).toMatchObject({ category: "AL_EXCESS", severity: "medium" });
  });

  it("interns with repeated missed punches", () => {
    const rows: InternAttendanceRow[] = [
      { id: "i1", name: "Ivy", employeeCode: "I0013", missingClockOuts: ["2026-11-03", "2026-11-05"], missingClockIns: [] },
      { id: "i2", name: "Ian", employeeCode: "I0014", missingClockOuts: [], missingClockIns: ["2026-11-04"] },
    ];
    const f = buildFindings([], rows);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ category: "ATTENDANCE", severity: "high", employeeCode: "I0013" });
  });

  it("sorts high before medium before low", () => {
    const f = buildFindings(
      [
        person({ id: "a", name: "A", mcLeaves: Array.from({ length: 4 }, (_, i) => ({ startDate: d(`2026-0${i + 1}-14`), endDate: d(`2026-0${i + 1}-14`), days: 1 })), mc: { earned: 11.5, used: 4, pending: 0 } }),
        person({ id: "b", name: "B", npl: { cap: 1, used: 2, pending: 0 } }),
      ],
      [],
    );
    expect(f.map((x) => x.severity)).toEqual(["high", "low"]);
  });

  it("email lists findings and escapes names", () => {
    const html = findingsEmailHtml(buildFindings([person({ name: "<b>X</b>", npl: { cap: 1, used: 2, pending: 0 } })], []), "Weekly", "https://hr");
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(html).toContain("https://hr/dashboard");
  });
});
