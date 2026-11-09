/**
 * Reconciliation summary (pure). Works on either matcher output or stored items.
 *
 * Standard bank reconciliation as at period end (assumes the opening position was
 * already reconciled):
 *
 *   Bank closing balance
 *   + QuickBooks deposits not yet on the statement   (unmatched QB credits)
 *   − QuickBooks payments not yet on the statement   (unmatched QB debits)
 *   = Adjusted bank balance
 *
 *   QuickBooks balance at period end
 *   + Statement credits not recorded in QuickBooks   (unmatched bank credits, and pairs whose QB date is after period end)
 *   − Statement debits not recorded in QuickBooks    (same, debits)
 *   ± Amount differences on matched pairs            (bank − QB)
 *   = Adjusted QuickBooks balance
 *
 *   Unexplained difference = adjusted bank − adjusted QuickBooks (0 when fully reconciled)
 */
import Decimal from "decimal.js";
import type { BankDirection } from "@/lib/quickbooks/bank-activity";
import type { ItemStatus } from "./matcher";

export interface SummaryItem {
  status: ItemStatus | string;
  bankAmount: string | null;
  bankDirection: BankDirection | string | null;
  qbAmount: string | null;
  qbDirection: BankDirection | string | null;
  /** YYYY-MM-DD */
  qbDate: string | null;
  reviewed?: boolean;
}

export interface ReconciliationSummary {
  bankCount: number;
  qbCount: number;
  matchedCount: number;
  mismatchCount: number;
  unmatchedBankCount: number;
  unmatchedQbCount: number;
  reviewedCount: number;
  /** Paired statement rows (matched + amount mismatch) / statement rows, 0..100, 1dp */
  matchRate: number;
  bankInflow: string;
  bankOutflow: string;
  qbInflow: string;
  qbOutflow: string;
  netBankMovement: string;
  netQbMovement: string;
  movementDifference: string;
  reconciling: {
    qbCreditsNotInBank: string;
    qbDebitsNotInBank: string;
    bankCreditsNotInQb: string;
    bankDebitsNotInQb: string;
    amountDifferences: string;
    /** Net of every reconciling item: expected (bank closing − QB closing). */
    totalReconcilingItems: string;
  };
  balances: null | {
    bankClosingBalance: string;
    qbClosingBalance: string;
    rawDifference: string;
    adjustedBankBalance: string;
    adjustedQbBalance: string;
    unexplainedDifference: string;
    reconciled: boolean;
  };
}

const D = (v: string | null | undefined) => new Decimal(v ?? 0);
const sgn = (amount: string | null, dir: string | null) => (dir === "CREDIT" ? D(amount) : D(amount).neg());

export function summarize(
  items: SummaryItem[],
  period: { start: string; end: string },
  balances?: { bankClosingBalance?: string | null; qbClosingBalance?: string | null },
): ReconciliationSummary {
  let bankIn = new Decimal(0);
  let bankOut = new Decimal(0);
  let qbIn = new Decimal(0);
  let qbOut = new Decimal(0);
  let qbCrNotBank = new Decimal(0);
  let qbDrNotBank = new Decimal(0);
  let bankCrNotQb = new Decimal(0);
  let bankDrNotQb = new Decimal(0);
  let amountDiffs = new Decimal(0);
  const counts = { bank: 0, qb: 0, MATCHED: 0, AMOUNT_MISMATCH: 0, UNMATCHED_BANK: 0, UNMATCHED_QB: 0, reviewed: 0 };

  const inPeriod = (d: string | null) => !!d && d >= period.start && d <= period.end;
  const afterEnd = (d: string | null) => !!d && d > period.end;

  for (const it of items) {
    if (it.reviewed) counts.reviewed++;
    if (it.status in counts) (counts as any)[it.status]++;

    if (it.bankAmount !== null && it.bankAmount !== undefined) {
      counts.bank++;
      if (it.bankDirection === "CREDIT") bankIn = bankIn.plus(D(it.bankAmount));
      else bankOut = bankOut.plus(D(it.bankAmount));
    }
    if (it.qbAmount !== null && it.qbAmount !== undefined) {
      counts.qb++;
      if (inPeriod(it.qbDate)) {
        if (it.qbDirection === "CREDIT") qbIn = qbIn.plus(D(it.qbAmount));
        else qbOut = qbOut.plus(D(it.qbAmount));
      }
    }

    switch (it.status) {
      case "UNMATCHED_BANK":
        if (it.bankDirection === "CREDIT") bankCrNotQb = bankCrNotQb.plus(D(it.bankAmount));
        else bankDrNotQb = bankDrNotQb.plus(D(it.bankAmount));
        break;
      case "UNMATCHED_QB":
        if (it.qbDirection === "CREDIT") qbCrNotBank = qbCrNotBank.plus(D(it.qbAmount));
        else qbDrNotBank = qbDrNotBank.plus(D(it.qbAmount));
        break;
      case "MATCHED":
      case "AMOUNT_MISMATCH":
        if (afterEnd(it.qbDate)) {
          // Recorded in QuickBooks only after period end: at period end QB lacks it entirely.
          if (it.bankDirection === "CREDIT") bankCrNotQb = bankCrNotQb.plus(D(it.bankAmount));
          else bankDrNotQb = bankDrNotQb.plus(D(it.bankAmount));
        } else {
          amountDiffs = amountDiffs.plus(sgn(it.bankAmount, it.bankDirection as string).minus(sgn(it.qbAmount, it.qbDirection as string)));
        }
        break;
    }
  }

  const netBank = bankIn.minus(bankOut);
  const netQb = qbIn.minus(qbOut);
  const total = bankCrNotQb.minus(bankDrNotQb).plus(amountDiffs).minus(qbCrNotBank.minus(qbDrNotBank));
  const paired = counts.MATCHED + counts.AMOUNT_MISMATCH;

  let bal: ReconciliationSummary["balances"] = null;
  if (balances?.bankClosingBalance != null && balances?.qbClosingBalance != null && balances.bankClosingBalance !== "" && balances.qbClosingBalance !== "") {
    const bank = D(balances.bankClosingBalance);
    const qb = D(balances.qbClosingBalance);
    const adjBank = bank.plus(qbCrNotBank).minus(qbDrNotBank);
    const adjQb = qb.plus(bankCrNotQb).minus(bankDrNotQb).plus(amountDiffs);
    const unexplained = adjBank.minus(adjQb);
    bal = {
      bankClosingBalance: bank.toFixed(2),
      qbClosingBalance: qb.toFixed(2),
      rawDifference: bank.minus(qb).toFixed(2),
      adjustedBankBalance: adjBank.toFixed(2),
      adjustedQbBalance: adjQb.toFixed(2),
      unexplainedDifference: unexplained.toFixed(2),
      reconciled: unexplained.isZero(),
    };
  }

  return {
    bankCount: counts.bank,
    qbCount: counts.qb,
    matchedCount: counts.MATCHED,
    mismatchCount: counts.AMOUNT_MISMATCH,
    unmatchedBankCount: counts.UNMATCHED_BANK,
    unmatchedQbCount: counts.UNMATCHED_QB,
    reviewedCount: counts.reviewed,
    matchRate: counts.bank === 0 ? 0 : Math.round((paired / counts.bank) * 1000) / 10,
    bankInflow: bankIn.toFixed(2),
    bankOutflow: bankOut.toFixed(2),
    qbInflow: qbIn.toFixed(2),
    qbOutflow: qbOut.toFixed(2),
    netBankMovement: netBank.toFixed(2),
    netQbMovement: netQb.toFixed(2),
    movementDifference: netBank.minus(netQb).toFixed(2),
    reconciling: {
      qbCreditsNotInBank: qbCrNotBank.toFixed(2),
      qbDebitsNotInBank: qbDrNotBank.toFixed(2),
      bankCreditsNotInQb: bankCrNotQb.toFixed(2),
      bankDebitsNotInQb: bankDrNotQb.toFixed(2),
      amountDifferences: amountDiffs.toFixed(2),
      totalReconcilingItems: total.toFixed(2),
    },
    balances: bal,
  };
}
