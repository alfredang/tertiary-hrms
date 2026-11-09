/**
 * Turns QuickBooks transactions into "what hit this bank account" rows, so they can be
 * reconciled against the DBS statement (BankTransaction).
 *
 * Direction uses the bank-statement convention of BankTransaction:
 *   DEBIT  = money left the bank account (withdrawal)
 *   CREDIT = money came into the bank account (deposit)
 *
 * Entities covered: Purchase (expense/cheque/card, incl. refunds via Credit=true),
 * Deposit, Payment (only when deposited straight to the bank, not Undeposited Funds),
 * SalesReceipt, RefundReceipt, BillPayment (cheque/bank and card), Transfer,
 * CreditCardPayment, JournalEntry (net of the lines posting to the bank account).
 *
 * Amounts are decimal strings (decimal.js); QBO's JSON numbers are 2-dp so
 * String(n) round-trips exactly.
 */
import Decimal from "decimal.js";
import type { QuickBooksClient } from "./client";

export type BankDirection = "DEBIT" | "CREDIT";

export interface QbBankTxn {
  qbTxnType: string;
  qbTxnId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Positive decimal string, 2dp */
  amount: string;
  direction: BankDirection;
  docNumber: string;
  payee: string;
  memo: string;
  /** Ids of QBO transactions this one links to (e.g. the Invoice a Payment settles). */
  linkedTxnIds: string[];
}

export const QB_BANK_ENTITIES = [
  "Purchase",
  "Deposit",
  "Payment",
  "SalesReceipt",
  "RefundReceipt",
  "BillPayment",
  "Transfer",
  "CreditCardPayment",
  "JournalEntry",
] as const;

const ref = (r: any): string => (r && r.value != null ? String(r.value) : "");
const refName = (r: any): string => (r && r.name ? String(r.name) : "");
const money = (v: unknown): Decimal => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  try {
    return new Decimal(String(v));
  } catch {
    return new Decimal(0);
  }
};
const fmt = (d: Decimal) => d.abs().toFixed(2);

function linkedIds(txn: any): string[] {
  const ids = new Set<string>();
  for (const l of txn?.LinkedTxn ?? []) if (l?.TxnId) ids.add(String(l.TxnId));
  for (const line of txn?.Line ?? []) for (const l of line?.LinkedTxn ?? []) if (l?.TxnId) ids.add(String(l.TxnId));
  return Array.from(ids);
}

function base(type: string, txn: any) {
  return {
    qbTxnType: type,
    qbTxnId: String(txn?.Id ?? ""),
    date: String(txn?.TxnDate ?? "").slice(0, 10),
    docNumber: String(txn?.DocNumber ?? txn?.PaymentRefNum ?? ""),
    memo: String(txn?.PrivateNote ?? txn?.Memo ?? ""),
    linkedTxnIds: linkedIds(txn),
  };
}

/**
 * Normalise one QBO transaction for the given bank account id. Returns null when the
 * transaction does not touch that account (or nets to zero against it).
 */
export function normalizeQbTxn(type: string, txn: any, bankAccountId: string): QbBankTxn | null {
  if (!txn || txn.Id == null) return null;
  const acct = String(bankAccountId);
  switch (type) {
    case "Purchase": {
      if (ref(txn.AccountRef) !== acct) return null;
      const amt = money(txn.TotalAmt);
      if (amt.isZero()) return null;
      // Credit=true is a refund/credit back to the account (money in).
      const direction: BankDirection = txn.Credit === true ? "CREDIT" : "DEBIT";
      return { ...base(type, txn), amount: fmt(amt), direction, payee: refName(txn.EntityRef) };
    }
    case "Deposit": {
      if (ref(txn.DepositToAccountRef) !== acct) return null;
      const amt = money(txn.TotalAmt);
      if (amt.isZero()) return null;
      const entity = (txn.Line ?? []).map((l: any) => refName(l?.DepositLineDetail?.Entity)).find(Boolean) ?? "";
      return { ...base(type, txn), amount: fmt(amt), direction: amt.isNeg() ? "DEBIT" : "CREDIT", payee: entity };
    }
    case "Payment":
    case "SalesReceipt": {
      // A Payment parked in Undeposited Funds has no DepositToAccountRef to the bank;
      // the later Deposit carries it instead, so it is skipped here.
      if (ref(txn.DepositToAccountRef) !== acct) return null;
      const amt = money(txn.TotalAmt);
      if (amt.isZero()) return null;
      return { ...base(type, txn), amount: fmt(amt), direction: "CREDIT", payee: refName(txn.CustomerRef) };
    }
    case "RefundReceipt": {
      if (ref(txn.DepositToAccountRef) !== acct) return null;
      const amt = money(txn.TotalAmt);
      if (amt.isZero()) return null;
      return { ...base(type, txn), amount: fmt(amt), direction: "DEBIT", payee: refName(txn.CustomerRef) };
    }
    case "BillPayment": {
      const bankRef = txn.PayType === "CreditCard" ? txn.CreditCardPayment?.CCAccountRef : txn.CheckPayment?.BankAccountRef;
      if (ref(bankRef) !== acct) return null;
      const amt = money(txn.TotalAmt);
      if (amt.isZero()) return null;
      return { ...base(type, txn), amount: fmt(amt), direction: "DEBIT", payee: refName(txn.VendorRef) };
    }
    case "Transfer": {
      const from = ref(txn.FromAccountRef);
      const to = ref(txn.ToAccountRef);
      if (from !== acct && to !== acct) return null;
      if (from === acct && to === acct) return null;
      const amt = money(txn.Amount);
      if (amt.isZero()) return null;
      const direction: BankDirection = from === acct ? "DEBIT" : "CREDIT";
      const other = direction === "DEBIT" ? refName(txn.ToAccountRef) : refName(txn.FromAccountRef);
      return { ...base(type, txn), amount: fmt(amt), direction, payee: other ? `Transfer ${direction === "DEBIT" ? "to" : "from"} ${other}` : "Transfer" };
    }
    case "CreditCardPayment": {
      if (ref(txn.BankAccountRef) !== acct) return null;
      const amt = money(txn.Amount);
      if (amt.isZero()) return null;
      return { ...base(type, txn), amount: fmt(amt), direction: "DEBIT", payee: refName(txn.CreditCardAccountRef) || "Credit card payment" };
    }
    case "JournalEntry": {
      // Debit to a bank (asset) account = money in; credit = money out. Net the lines.
      let net = new Decimal(0);
      let payee = "";
      let lineDesc = "";
      for (const line of txn.Line ?? []) {
        const d = line?.JournalEntryLineDetail;
        if (!d || ref(d.AccountRef) !== acct) continue;
        const amt = money(line.Amount);
        net = d.PostingType === "Credit" ? net.minus(amt) : net.plus(amt);
        payee = payee || refName(d.Entity?.EntityRef);
        lineDesc = lineDesc || String(line.Description ?? "");
      }
      if (net.isZero()) return null;
      const b = base(type, txn);
      return { ...b, memo: b.memo || lineDesc, amount: fmt(net), direction: net.isNeg() ? "DEBIT" : "CREDIT", payee };
    }
    default:
      return null;
  }
}

/** Signed amount from the bank's point of view: + for CREDIT (in), − for DEBIT (out). */
export function signed(amount: string | Decimal, direction: BankDirection): Decimal {
  const d = new Decimal(amount);
  return direction === "CREDIT" ? d : d.neg();
}

export interface FetchBankActivityResult {
  txns: QbBankTxn[];
  warnings: string[];
}

/**
 * Fetch every QBO transaction dated [from, to] that hits `bankAccountId`.
 * An entity the company file does not support (e.g. CreditCardPayment on old files)
 * is skipped with a warning rather than failing the run.
 */
export async function fetchQbBankActivity(
  client: QuickBooksClient,
  bankAccountId: string,
  from: string,
  to: string,
): Promise<FetchBankActivityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("from/to must be YYYY-MM-DD");
  }
  const where = `TxnDate >= '${from}' AND TxnDate <= '${to}'`;
  const txns: QbBankTxn[] = [];
  const warnings: string[] = [];
  // Sequential on purpose: stays well inside QBO's per-realm concurrency limit.
  for (const entity of QB_BANK_ENTITIES) {
    let rows: any[];
    try {
      rows = await client.queryAll(entity, where);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (entity === "CreditCardPayment" || entity === "JournalEntry") {
        warnings.push(`${entity} not read: ${msg}`);
        continue;
      }
      throw err;
    }
    for (const row of rows) {
      const n = normalizeQbTxn(entity, row, bankAccountId);
      if (n) txns.push(n);
    }
  }
  txns.sort((a, b) => a.date.localeCompare(b.date) || a.qbTxnType.localeCompare(b.qbTxnType) || a.qbTxnId.localeCompare(b.qbTxnId));
  return { txns, warnings };
}

export interface QbBankAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance: string;
  currency: string;
  active: boolean;
}

export async function listQbBankAccounts(client: QuickBooksClient): Promise<QbBankAccount[]> {
  const rows = await client.queryAll<any>("Account", "AccountType = 'Bank'");
  return rows.map((a) => ({
    id: String(a.Id),
    name: String(a.FullyQualifiedName ?? a.Name ?? a.Id),
    accountType: String(a.AccountType ?? "Bank"),
    currentBalance: money(a.CurrentBalance).toFixed(2),
    currency: String(a.CurrencyRef?.value ?? "SGD"),
    active: a.Active !== false,
  }));
}

/** Default bank account: the active DBS account (as the expense/payment push uses), else the first. */
export function pickDefaultBankAccount(accounts: QbBankAccount[]): QbBankAccount | null {
  const active = accounts.filter((a) => a.active);
  return active.find((a) => a.name.toLowerCase().includes("dbs")) ?? active[0] ?? accounts[0] ?? null;
}
