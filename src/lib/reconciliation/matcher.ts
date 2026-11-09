/**
 * Bank reconciliation matcher (pure; no DB, no network).
 *
 * Pairs DBS statement rows (BankTransaction) with QuickBooks bank activity:
 *
 *   0. Manual pairs carried over from an earlier run (method MANUAL).
 *   1. Existing HRMS links: BankTransaction.qbExpenseId was set when the row was pushed
 *      to QBO (Purchase id for expenses; Payment id — or the Invoice id the Payment
 *      settles — for income). Method LINKED.
 *   2. Exact amount + same direction + date within ±window days, ranked by date
 *      closeness and description/payee/reference similarity. Method AUTO.
 *   3. Same direction + date window + strong description or reference match, but the
 *      amount differs by no more than `mismatchMaxRatio` → AMOUNT_MISMATCH.
 *   4. Everything left is UNMATCHED_BANK / UNMATCHED_QB.
 *
 * Pairs a user explicitly un-matched (`forbiddenPairs`) are never auto-paired again.
 * Assignment within a stage is global-greedy by score with deterministic tie-breaks,
 * so the result does not depend on input order.
 *
 * All money is decimal.js. Never compare amounts as floats.
 */
import Decimal from "decimal.js";
import type { BankDirection, QbBankTxn } from "@/lib/quickbooks/bank-activity";

export interface BankRow {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Positive decimal string */
  amount: string;
  direction: BankDirection;
  title: string;
  rawDescription: string;
  paymentRef?: string | null;
  invoiceNo?: string | null;
  /**
   * QBO id recorded when the row was pushed to QuickBooks: Purchase id for expenses;
   * Payment id for received income (or the Invoice id when it was already paid in QBO).
   */
  qbExpenseId?: string | null;
  /** QBO DocNumber recorded alongside qbExpenseId. */
  qbExpenseNo?: string | null;
}

export type ItemStatus = "MATCHED" | "AMOUNT_MISMATCH" | "UNMATCHED_BANK" | "UNMATCHED_QB";
export type MatchMethod = "LINKED" | "AUTO" | "MANUAL";

export interface MatchItem {
  status: ItemStatus;
  method: MatchMethod | null;
  confidence: number | null;
  bank: BankRow | null;
  qb: QbBankTxn | null;
  /** bank − qb, 2dp string (null unless both sides present) */
  amountDifference: string | null;
  /** qb date − bank date in days */
  dayDifference: number | null;
}

export interface MatchOptions {
  dateWindowDays?: number;
  /** Max |bank − qb| / bank for the AMOUNT_MISMATCH stage. Default 0.25. */
  mismatchMaxRatio?: number;
  /** Min similarity for the AMOUNT_MISMATCH stage when no reference matches. Default 0.5. */
  mismatchMinSimilarity?: number;
  /** Manual pairs to honour first: bank id → qb key ("Type:Id"). */
  forcedPairs?: Array<{ bankId: string; qbKey: string }>;
  /** Pair keys ("bankId|Type:Id") that must not be auto-paired. */
  forbiddenPairs?: Iterable<string>;
}

export const qbKey = (q: Pick<QbBankTxn, "qbTxnType" | "qbTxnId">) => `${q.qbTxnType}:${q.qbTxnId}`;
export const pairKey = (bankId: string, qb: Pick<QbBankTxn, "qbTxnType" | "qbTxnId"> | string) =>
  `${bankId}|${typeof qb === "string" ? qb : qbKey(qb)}`;

// ── Text similarity ──────────────────────────────────────────────────────────

const NOISE = new Set([
  "PTE", "LTD", "PRIVATE", "LIMITED", "LLP", "INC", "CO", "SG", "SGP", "SINGAPORE", "THE", "AND", "OF", "FOR",
  "FAST", "PAYMENT", "PAYMENTS", "GIRO", "INTERBANK", "IBG", "TRANSFER", "TRF", "INWARD", "OUTWARD", "PAYNOW",
  "OTHR", "OTHER", "DBS", "POSB", "BANK", "SGD", "REF", "INV", "INVOICE", "FUND", "FUNDS", "TXN", "TO", "FROM",
  "BY", "VIA", "INCOMING", "OUTGOING", "ADVICE", "CREDIT", "DEBIT", "CARD", "BUSINESS", "ADVANCE", "BAT", "MCT",
  "COLLECTION", "REMITTANCE", "TT", "NETS", "QR", "ALLW", "SAL",
]);

export function tokenize(text: string | null | undefined): string[] {
  const words = String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !NOISE.has(w) && !/^\d{1,3}$/.test(w));
  return Array.from(new Set(words));
}

/** Dice coefficient over token sets, with ≥4-char prefix matches counted as hits. 0..1 */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const used = new Set<number>();
  let hits = 0;
  for (const x of ta) {
    let found = tb.findIndex((y, i) => !used.has(i) && y === x);
    if (found < 0) {
      found = tb.findIndex(
        (y, i) => !used.has(i) && Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)),
      );
    }
    if (found >= 0) {
      used.add(found);
      hits++;
    }
  }
  return (2 * hits) / (ta.length + tb.length);
}

const normRef = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** True when a reference on one side (invoice no., bank ref, doc number) appears on the other. */
export function referenceMatch(bank: BankRow, qb: QbBankTxn): boolean {
  const qbText = normRef(`${qb.docNumber} ${qb.memo} ${qb.payee}`);
  const bankText = normRef(`${bank.rawDescription} ${bank.paymentRef ?? ""} ${bank.invoiceNo ?? ""}`);
  const bankRefs = [bank.invoiceNo, bank.paymentRef, bank.qbExpenseNo].map(normRef).filter((r) => r.length >= 5);
  if (bankRefs.some((r) => qbText.includes(r))) return true;
  const doc = normRef(qb.docNumber);
  return doc.length >= 5 && bankText.includes(doc);
}

// ── Date helpers ─────────────────────────────────────────────────────────────

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}
export const dayDiff = (bankDate: string, qbDate: string) => dayNumber(qbDate) - dayNumber(bankDate);

// ── Matching ─────────────────────────────────────────────────────────────────

const bankText = (b: BankRow) => `${b.title} ${b.rawDescription}`;
const qbText = (q: QbBankTxn) => `${q.payee} ${q.memo} ${q.docNumber}`;

function pairItem(bank: BankRow, qb: QbBankTxn, method: MatchMethod, confidence: number): MatchItem {
  const diff = new Decimal(bank.amount).minus(new Decimal(qb.amount));
  return {
    status: diff.isZero() ? "MATCHED" : "AMOUNT_MISMATCH",
    method,
    confidence,
    bank,
    qb,
    amountDifference: diff.toFixed(2),
    dayDifference: dayDiff(bank.date, qb.date),
  };
}

interface Candidate {
  bankIdx: number;
  qbIdx: number;
  score: number;
  confidence: number;
}

/** Global greedy: highest score first; ties broken by bank date/id then qb date/id. */
function assign(cands: Candidate[], banks: BankRow[], qbs: QbBankTxn[], takenBank: Set<number>, takenQb: Set<number>): Candidate[] {
  cands.sort(
    (a, b) =>
      b.score - a.score ||
      banks[a.bankIdx].date.localeCompare(banks[b.bankIdx].date) ||
      banks[a.bankIdx].id.localeCompare(banks[b.bankIdx].id) ||
      qbs[a.qbIdx].date.localeCompare(qbs[b.qbIdx].date) ||
      qbKey(qbs[a.qbIdx]).localeCompare(qbKey(qbs[b.qbIdx])),
  );
  const chosen: Candidate[] = [];
  for (const c of cands) {
    if (takenBank.has(c.bankIdx) || takenQb.has(c.qbIdx)) continue;
    takenBank.add(c.bankIdx);
    takenQb.add(c.qbIdx);
    chosen.push(c);
  }
  return chosen;
}

export function matchTransactions(banks: BankRow[], qbs: QbBankTxn[], opts: MatchOptions = {}): MatchItem[] {
  const window = Math.max(0, opts.dateWindowDays ?? 3);
  const maxRatio = new Decimal(opts.mismatchMaxRatio ?? 0.25);
  const minSim = opts.mismatchMinSimilarity ?? 0.5;
  const forbidden = new Set(opts.forbiddenPairs ?? []);
  const takenBank = new Set<number>();
  const takenQb = new Set<number>();
  const items: MatchItem[] = [];

  const bankIndex = new Map(banks.map((b, i) => [b.id, i]));
  const qbIndex = new Map(qbs.map((q, i) => [qbKey(q), i]));

  // Stage 0: manual pairs.
  for (const fp of opts.forcedPairs ?? []) {
    const bi = bankIndex.get(fp.bankId);
    const qi = qbIndex.get(fp.qbKey);
    if (bi === undefined || qi === undefined || takenBank.has(bi) || takenQb.has(qi)) continue;
    takenBank.add(bi);
    takenQb.add(qi);
    items.push(pairItem(banks[bi], qbs[qi], "MANUAL", 100));
  }

  // Stage 1: existing HRMS → QBO links.
  const linkCands: Candidate[] = [];
  banks.forEach((b, bi) => {
    if (takenBank.has(bi) || !b.qbExpenseId) return;
    const linkId = String(b.qbExpenseId);
    qbs.forEach((q, qi) => {
      if (takenQb.has(qi) || q.direction !== b.direction || forbidden.has(pairKey(b.id, q))) return;
      // QBO ids are only unique per entity type, so a direct link must also match the type
      // the push route created: Purchase for expenses, Payment for received income.
      const direct = q.qbTxnId === linkId && q.qbTxnType === (b.direction === "DEBIT" ? "Purchase" : "Payment");
      const viaInvoice = b.direction === "CREDIT" && q.linkedTxnIds.includes(linkId);
      if (!direct && !viaInvoice) return;
      const days = Math.abs(dayDiff(b.date, q.date));
      const exact = new Decimal(b.amount).eq(q.amount);
      // Prefer the exact-amount, closest-dated candidate when one invoice has several payments.
      linkCands.push({ bankIdx: bi, qbIdx: qi, score: (exact ? 1000 : 0) + (direct ? 100 : 0) - days, confidence: exact ? 100 : 80 });
    });
  });
  for (const c of assign(linkCands, banks, qbs, takenBank, takenQb)) {
    items.push(pairItem(banks[c.bankIdx], qbs[c.qbIdx], "LINKED", c.confidence));
  }

  // Stage 2: exact amount within the date window.
  const exactCands: Candidate[] = [];
  banks.forEach((b, bi) => {
    if (takenBank.has(bi)) return;
    const bAmt = new Decimal(b.amount);
    qbs.forEach((q, qi) => {
      if (takenQb.has(qi) || q.direction !== b.direction) return;
      if (!bAmt.eq(q.amount)) return;
      const days = Math.abs(dayDiff(b.date, q.date));
      if (days > window || forbidden.has(pairKey(b.id, q))) return;
      const dateScore = 1 - days / (window + 1);
      const sim = similarity(bankText(b), qbText(q));
      const refHit = referenceMatch(b, q) ? 1 : 0;
      const textScore = Math.max(sim, refHit);
      const score = 0.45 * dateScore + 0.4 * textScore + 0.15 * refHit;
      const confidence = Math.round(100 * (0.6 + 0.2 * dateScore + 0.2 * textScore));
      exactCands.push({ bankIdx: bi, qbIdx: qi, score, confidence });
    });
  });
  for (const c of assign(exactCands, banks, qbs, takenBank, takenQb)) {
    items.push(pairItem(banks[c.bankIdx], qbs[c.qbIdx], "AUTO", c.confidence));
  }

  // Stage 3: probable same transaction, different amount (fees, FX, partial payment).
  const mismatchCands: Candidate[] = [];
  banks.forEach((b, bi) => {
    if (takenBank.has(bi)) return;
    const bAmt = new Decimal(b.amount);
    if (bAmt.isZero()) return;
    qbs.forEach((q, qi) => {
      if (takenQb.has(qi) || q.direction !== b.direction) return;
      const days = Math.abs(dayDiff(b.date, q.date));
      if (days > window || forbidden.has(pairKey(b.id, q))) return;
      const ratio = bAmt.minus(q.amount).abs().div(bAmt);
      if (ratio.gt(maxRatio)) return;
      const sim = similarity(bankText(b), qbText(q));
      const refHit = referenceMatch(b, q);
      if (!refHit && sim < minSim) return;
      const dateScore = 1 - days / (window + 1);
      const amountScore = 1 - ratio.div(maxRatio).toNumber(); // ranking only, not money
      const score = 0.4 * Math.max(sim, refHit ? 1 : 0) + 0.3 * amountScore + 0.3 * dateScore;
      mismatchCands.push({ bankIdx: bi, qbIdx: qi, score, confidence: Math.round(100 * (0.3 + 0.5 * score)) });
    });
  });
  for (const c of assign(mismatchCands, banks, qbs, takenBank, takenQb)) {
    items.push(pairItem(banks[c.bankIdx], qbs[c.qbIdx], "AUTO", c.confidence));
  }

  // Stage 4: leftovers.
  banks.forEach((b, bi) => {
    if (!takenBank.has(bi)) {
      items.push({ status: "UNMATCHED_BANK", method: null, confidence: null, bank: b, qb: null, amountDifference: null, dayDifference: null });
    }
  });
  qbs.forEach((q, qi) => {
    if (!takenQb.has(qi)) {
      items.push({ status: "UNMATCHED_QB", method: null, confidence: null, bank: null, qb: q, amountDifference: null, dayDifference: null });
    }
  });

  return items;
}
