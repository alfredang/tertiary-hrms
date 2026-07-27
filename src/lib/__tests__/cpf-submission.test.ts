import { describe, it, expect } from "vitest";
import { matchEmployee, normaliseName } from "@/lib/cpf-submission";

const candidates = [
  { id: "e1", name: "ALFRED ANG CHEW HOE", nric: "S1808997A" },
  { id: "e2", name: "ANG MING XUAN", nric: "T0023903D" },
  { id: "e3", name: "JASMINE SHO CHOOK KHIM", nric: null },
  { id: "e4", name: "KANDASAMY LAKSHAYA", nric: null },
  { id: "e5", name: "JYOTI CHOPRA", nric: "S8858232B" },
  { id: "e6", name: "ANG SEE SHIANG", nric: null },
];

describe("normaliseName", () => {
  it("uppercases and strips punctuation", () => {
    expect(normaliseName("Sylvia Tan  Mei-Jie")).toBe("SYLVIA TAN MEI JIE");
  });
});

describe("matchEmployee", () => {
  it("matches on CPF account number (NRIC) first", () => {
    // Name differs from the HRMS record, but the NRIC is authoritative.
    const m = matchEmployee({ cpfAccountNo: "S1808997A", name: "ANG CHEW HOE" }, candidates);
    expect(m.employeeId).toBe("e1");
    expect(m.method).toBe("nric");
  });

  it("matches on an exact normalised name when there is no NRIC", () => {
    const m = matchEmployee(
      { cpfAccountNo: "T0475176G", name: "Kandasamy Lakshaya" },
      candidates,
    );
    expect(m.employeeId).toBe("e4");
    expect(m.method).toBe("exact");
  });

  it("falls back to token overlap for CPF name variants", () => {
    // CPF prints "SHO CHOON KIM"; the HRMS record is "JASMINE SHO CHOOK KHIM".
    const m = matchEmployee({ cpfAccountNo: "S7124866F", name: "SHO CHOON KIM" }, candidates);
    expect(m.employeeId).toBe("e3");
    expect(m.method).toBe("tokens");
  });

  it("returns no match rather than guessing on a single shared token", () => {
    const m = matchEmployee({ cpfAccountNo: "X0000000X", name: "TAN SWEE ENG" }, candidates);
    expect(m.employeeId).toBeNull();
    expect(m.ambiguous).toBe(false);
  });

  it("flags ambiguity instead of picking one of two equal candidates", () => {
    const dupes = [
      { id: "a", name: "ANG MING XUAN", nric: null },
      { id: "b", name: "ANG MING XUAN", nric: null },
    ];
    const m = matchEmployee({ cpfAccountNo: "T0023903D", name: "ANG MING XUAN" }, dupes);
    expect(m.employeeId).toBeNull();
    expect(m.ambiguous).toBe(true);
  });

  it("does not fuzzily merge two distinct short names", () => {
    // TAN vs TAM / ANG differ by one letter but are different families; short
    // tokens must match exactly, so this must not resolve to anyone.
    const m = matchEmployee({ cpfAccountNo: "Y1111111Y", name: "TAM SEE SHIANG" }, [
      { id: "x", name: "ANG SEE SHIANG", nric: null },
      { id: "y", name: "TAN SEE SHIANG", nric: null },
    ]);
    expect(m.employeeId).toBeNull();
    expect(m.ambiguous).toBe(true);
  });

  it("prefers the exactly-matching candidate over a near one", () => {
    const m = matchEmployee({ cpfAccountNo: "Q0000000Q", name: "JYOTI CHOPRA" }, [
      { id: "near", name: "JYOTI CHOPRAA", nric: null },
      { id: "exact", name: "JYOTI CHOPRA", nric: null },
    ]);
    expect(m.employeeId).toBe("exact");
    expect(m.method).toBe("exact");
  });

  it("does not match an unrelated name", () => {
    const m = matchEmployee(
      { cpfAccountNo: "Z9999999Z", name: "NUR ZULAIKHA ABDULLAH" },
      candidates,
    );
    expect(m.employeeId).toBeNull();
  });
});
