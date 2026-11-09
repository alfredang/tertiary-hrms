import { describe, it, expect } from "vitest";
import { matchTransactions, similarity, tokenize, referenceMatch, pairKey, type BankRow } from "@/lib/reconciliation/matcher";
import type { QbBankTxn } from "@/lib/quickbooks/bank-activity";

const bank = (o: Partial<BankRow> & Pick<BankRow, "id" | "date" | "amount">): BankRow => ({
  direction: "DEBIT",
  title: "",
  rawDescription: "",
  paymentRef: "",
  invoiceNo: "",
  qbExpenseId: null,
  qbExpenseNo: null,
  ...o,
});
const qb = (o: Partial<QbBankTxn> & Pick<QbBankTxn, "qbTxnId" | "date" | "amount">): QbBankTxn => ({
  qbTxnType: "Purchase",
  direction: "DEBIT",
  docNumber: "",
  payee: "",
  memo: "",
  linkedTxnIds: [],
  ...o,
});
const byStatus = (items: ReturnType<typeof matchTransactions>, s: string) => items.filter((i) => i.status === s);

describe("similarity", () => {
  it("ignores bank boilerplate and company suffixes", () => {
    expect(tokenize("FAST PAYMENT | SMRT Trains Ltd | OTHR")).toEqual(["SMRT", "TRAINS"]);
    expect(similarity("INTERBANK GIRO | SMRT Trains Ltd", "SMRT Trains Pte Ltd")).toBe(1);
  });
  it("counts prefix matches of 4+ chars", () => {
    expect(similarity("Microsoft Singapore", "MICROSOFT*365")).toBeGreaterThan(0.5);
  });
  it("is 0 for unrelated text or empty input", () => {
    expect(similarity("Google Workspace", "CPF Board")).toBe(0);
    expect(similarity("", "CPF Board")).toBe(0);
  });
});

describe("referenceMatch", () => {
  it("matches an invoice number against the QBO doc number", () => {
    const b = bank({ id: "b", date: "2026-11-03", amount: "10.00", invoiceNo: "TC26-0501-000951" });
    expect(referenceMatch(b, qb({ qbTxnId: "1", date: "2026-11-03", amount: "10.00", docNumber: "TC26-0501-000951" }))).toBe(true);
    expect(referenceMatch(b, qb({ qbTxnId: "1", date: "2026-11-03", amount: "10.00", docNumber: "X" }))).toBe(false);
  });
});

describe("matchTransactions", () => {
  it("matches exact amount + direction within the date window", () => {
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "120.50", title: "SMRT Trains Ltd" })],
      [qb({ qbTxnId: "q1", date: "2026-11-05", amount: "120.50", payee: "SMRT Trains" })],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "MATCHED", method: "AUTO", amountDifference: "0.00", dayDifference: 2 });
    expect(items[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it("does not match outside the date window or across directions", () => {
    const items = matchTransactions(
      [
        bank({ id: "b1", date: "2026-11-01", amount: "50.00" }),
        bank({ id: "b2", date: "2026-11-01", amount: "75.00", direction: "CREDIT" }),
      ],
      [
        qb({ qbTxnId: "q1", date: "2026-11-05", amount: "50.00" }), // 4 days away, window 3
        qb({ qbTxnId: "q2", date: "2026-11-01", amount: "75.00", direction: "DEBIT" }),
      ],
      { dateWindowDays: 3 },
    );
    expect(byStatus(items, "UNMATCHED_BANK")).toHaveLength(2);
    expect(byStatus(items, "UNMATCHED_QB")).toHaveLength(2);
  });

  it("compares amounts as decimals, not floats", () => {
    // 0.1 + 0.2 style: the QB row is 0.30 exactly; a float sum would differ.
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "0.30" })],
      [qb({ qbTxnId: "q1", date: "2026-11-03", amount: "0.3" })],
    );
    expect(items[0].status).toBe("MATCHED");
    const off = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "100.00", title: "Acme" })],
      [qb({ qbTxnId: "q1", date: "2026-11-03", amount: "100.01", payee: "Zeta" })],
    );
    expect(off.find((i) => i.status === "MATCHED")).toBeUndefined();
  });

  it("uses description similarity to pick between same-amount candidates", () => {
    const items = matchTransactions(
      [
        bank({ id: "b1", date: "2026-11-03", amount: "500.00", title: "Google Asia Pacific" }),
        bank({ id: "b2", date: "2026-11-03", amount: "500.00", title: "Tan Yong Peng" }),
      ],
      [
        qb({ qbTxnId: "q1", date: "2026-11-03", amount: "500.00", payee: "Tan Yong Peng" }),
        qb({ qbTxnId: "q2", date: "2026-11-03", amount: "500.00", payee: "Google" }),
      ],
    );
    const pairs = Object.fromEntries(byStatus(items, "MATCHED").map((i) => [i.bank!.id, i.qb!.qbTxnId]));
    expect(pairs).toEqual({ b1: "q2", b2: "q1" });
  });

  it("result does not depend on input order", () => {
    const banks = [
      bank({ id: "b1", date: "2026-11-03", amount: "10.00", title: "Alpha" }),
      bank({ id: "b2", date: "2026-11-04", amount: "10.00", title: "Beta" }),
    ];
    const qbs = [
      qb({ qbTxnId: "q1", date: "2026-11-04", amount: "10.00", payee: "Beta" }),
      qb({ qbTxnId: "q2", date: "2026-11-03", amount: "10.00", payee: "Alpha" }),
    ];
    const key = (items: ReturnType<typeof matchTransactions>) =>
      items.filter((i) => i.bank && i.qb).map((i) => `${i.bank!.id}-${i.qb!.qbTxnId}`).sort();
    expect(key(matchTransactions(banks, qbs))).toEqual(key(matchTransactions([...banks].reverse(), [...qbs].reverse())));
    expect(key(matchTransactions(banks, qbs))).toEqual(["b1-q2", "b2-q1"]);
  });

  it("honours existing HRMS → QBO links (Purchase id for expenses)", () => {
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "80.00", qbExpenseId: "777" })],
      [
        qb({ qbTxnId: "100", date: "2026-11-03", amount: "80.00" }),
        qb({ qbTxnId: "777", date: "2026-11-09", amount: "80.00" }), // outside the window but linked
      ],
    );
    const m = items.find((i) => i.bank?.id === "b1")!;
    expect(m).toMatchObject({ status: "MATCHED", method: "LINKED" });
    expect(m.qb!.qbTxnId).toBe("777");
  });

  it("links income through the Invoice a QBO Payment settles, and flags a different amount", () => {
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "1000.00", direction: "CREDIT", qbExpenseId: "INV9" })],
      [qb({ qbTxnId: "p1", qbTxnType: "Payment", direction: "CREDIT", date: "2026-11-03", amount: "990.00", linkedTxnIds: ["INV9"] })],
    );
    expect(items[0]).toMatchObject({ status: "AMOUNT_MISMATCH", method: "LINKED", amountDifference: "10.00" });
  });

  it("does not treat an id of another entity type as a link", () => {
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "50.00", direction: "CREDIT", qbExpenseId: "42" })],
      [qb({ qbTxnId: "42", qbTxnType: "Deposit", direction: "CREDIT", date: "2026-11-20", amount: "50.00" })],
    );
    expect(items.find((i) => i.method === "LINKED")).toBeUndefined();
  });

  it("reports probable same transaction with a different amount as AMOUNT_MISMATCH", () => {
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "995.00", direction: "CREDIT", title: "SkillsFuture Singapore Agency" })],
      [qb({ qbTxnId: "d1", qbTxnType: "Deposit", direction: "CREDIT", date: "2026-11-02", amount: "1000.00", payee: "SkillsFuture Singapore" })],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "AMOUNT_MISMATCH", method: "AUTO", amountDifference: "-5.00", dayDifference: -1 });
  });

  it("does not call unrelated rows a mismatch", () => {
    const items = matchTransactions(
      [bank({ id: "b1", date: "2026-11-03", amount: "995.00", title: "Acme Pte Ltd" })],
      [qb({ qbTxnId: "q1", date: "2026-11-03", amount: "1000.00", payee: "Zenith Holdings" })],
    );
    expect(byStatus(items, "AMOUNT_MISMATCH")).toHaveLength(0);
  });

  it("applies manual pairs first and never re-pairs a forbidden pair", () => {
    const banks = [bank({ id: "b1", date: "2026-11-03", amount: "20.00", title: "Grab" })];
    const qbs = [
      qb({ qbTxnId: "q1", date: "2026-11-03", amount: "20.00", payee: "Grab" }),
      qb({ qbTxnId: "q2", date: "2026-11-01", amount: "25.00", payee: "Other" }),
    ];
    const forced = matchTransactions(banks, qbs, { forcedPairs: [{ bankId: "b1", qbKey: "Purchase:q2" }] });
    expect(forced.find((i) => i.bank?.id === "b1")).toMatchObject({ method: "MANUAL", status: "AMOUNT_MISMATCH" });
    expect(forced.find((i) => i.qb?.qbTxnId === "q1")!.status).toBe("UNMATCHED_QB");

    const forbidden = matchTransactions(banks, qbs, { forbiddenPairs: [pairKey("b1", "Purchase:q1")] });
    expect(forbidden.find((i) => i.bank?.id === "b1")!.status).toBe("UNMATCHED_BANK");
  });

  it("every input row appears in exactly one item", () => {
    const banks = Array.from({ length: 20 }, (_, i) => bank({ id: `b${i}`, date: `2026-11-${String((i % 9) + 1).padStart(2, "0")}`, amount: `${(i % 4) * 10 + 5}.00` }));
    const qbs = Array.from({ length: 17 }, (_, i) => qb({ qbTxnId: `q${i}`, date: `2026-11-${String((i % 9) + 2).padStart(2, "0")}`, amount: `${(i % 5) * 10 + 5}.00` }));
    const items = matchTransactions(banks, qbs);
    expect(items.filter((i) => i.bank).map((i) => i.bank!.id).sort()).toEqual(banks.map((b) => b.id).sort());
    expect(items.filter((i) => i.qb).map((i) => i.qb!.qbTxnId).sort()).toEqual(qbs.map((q) => q.qbTxnId).sort());
  });
});
