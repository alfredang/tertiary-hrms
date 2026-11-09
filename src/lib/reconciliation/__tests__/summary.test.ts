import { describe, it, expect } from "vitest";
import { summarize, type SummaryItem } from "@/lib/reconciliation/summary";

const period = { start: "2026-11-01", end: "2026-11-30" };
const it_ = (o: Partial<SummaryItem> & Pick<SummaryItem, "status">): SummaryItem => ({
  bankAmount: null,
  bankDirection: null,
  qbAmount: null,
  qbDirection: null,
  qbDate: null,
  ...o,
});

describe("summarize", () => {
  const items: SummaryItem[] = [
    it_({ status: "MATCHED", bankAmount: "100.00", bankDirection: "CREDIT", qbAmount: "100.00", qbDirection: "CREDIT", qbDate: "2026-11-05" }),
    it_({ status: "MATCHED", bankAmount: "40.10", bankDirection: "DEBIT", qbAmount: "40.10", qbDirection: "DEBIT", qbDate: "2026-11-06", reviewed: true }),
    // bank received 995, QB says 1000 → book is 5 too high
    it_({ status: "AMOUNT_MISMATCH", bankAmount: "995.00", bankDirection: "CREDIT", qbAmount: "1000.00", qbDirection: "CREDIT", qbDate: "2026-11-07" }),
    it_({ status: "UNMATCHED_BANK", bankAmount: "12.00", bankDirection: "DEBIT" }), // bank charge not in QB
    it_({ status: "UNMATCHED_QB", qbAmount: "300.00", qbDirection: "CREDIT", qbDate: "2026-11-30" }), // deposit in transit
    it_({ status: "UNMATCHED_QB", qbAmount: "50.00", qbDirection: "DEBIT", qbDate: "2026-11-29" }), // outstanding payment
    // matched, but QB dated after period end → at period end QB does not have it yet
    it_({ status: "MATCHED", bankAmount: "20.00", bankDirection: "DEBIT", qbAmount: "20.00", qbDirection: "DEBIT", qbDate: "2026-12-02" }),
  ];

  it("counts and match rate", () => {
    const s = summarize(items, period);
    expect(s).toMatchObject({ bankCount: 5, qbCount: 6, matchedCount: 3, mismatchCount: 1, unmatchedBankCount: 1, unmatchedQbCount: 2, reviewedCount: 1 });
    expect(s.matchRate).toBe(80); // 4 of 5 statement rows paired
  });

  it("movement totals in decimals, QB limited to the period", () => {
    const s = summarize(items, period);
    expect(s.bankInflow).toBe("1095.00");
    expect(s.bankOutflow).toBe("72.10");
    expect(s.qbInflow).toBe("1400.00");
    expect(s.qbOutflow).toBe("90.10"); // the 2026-12-02 row is outside the period
    expect(s.netBankMovement).toBe("1022.90");
    expect(s.netQbMovement).toBe("1309.90");
    expect(s.movementDifference).toBe("-287.00");
  });

  it("reconciling items", () => {
    const r = summarize(items, period).reconciling;
    expect(r).toEqual({
      qbCreditsNotInBank: "300.00",
      qbDebitsNotInBank: "50.00",
      bankCreditsNotInQb: "0.00",
      bankDebitsNotInQb: "32.00", // 12 bank charge + 20 recorded in QB after period end
      amountDifferences: "-5.00",
      totalReconcilingItems: "-287.00",
    });
  });

  it("balance reconciliation is zero when the only gaps are the listed items", () => {
    // Opening position reconciled at 10,000. Bank closing = 10,000 + 1022.90.
    // QB closing at period end = 10,000 + 1309.90 (in-period QB movement).
    const s = summarize(items, period, { bankClosingBalance: "11022.90", qbClosingBalance: "11309.90" });
    expect(s.balances).toEqual({
      bankClosingBalance: "11022.90",
      qbClosingBalance: "11309.90",
      rawDifference: "-287.00",
      adjustedBankBalance: "11272.90",
      adjustedQbBalance: "11272.90",
      unexplainedDifference: "0.00",
      reconciled: true,
    });
  });

  it("surfaces an unexplained difference", () => {
    const s = summarize(items, period, { bankClosingBalance: "11023.00", qbClosingBalance: "11309.90" });
    expect(s.balances!.unexplainedDifference).toBe("0.10");
    expect(s.balances!.reconciled).toBe(false);
  });

  it("no balances section without both balances", () => {
    expect(summarize(items, period, { bankClosingBalance: "1.00", qbClosingBalance: null }).balances).toBeNull();
    expect(summarize([], period).matchRate).toBe(0);
  });
});
