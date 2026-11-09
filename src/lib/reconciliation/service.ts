/**
 * Bank reconciliation runs: load statement rows + QuickBooks bank activity, match them,
 * persist the run, and support manual match / unmatch / review afterwards.
 *
 * QuickBooks is read-only here. Manual decisions (manual pairs, un-matched pairs and
 * reviews with notes) are carried forward into later runs that cover the same rows.
 */
import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createQuickBooksClient } from "@/lib/quickbooks/store";
import {
  fetchQbBankActivity,
  listQbBankAccounts,
  pickDefaultBankAccount,
  signed,
  type QbBankTxn,
} from "@/lib/quickbooks/bank-activity";
import { matchTransactions, pairKey, qbKey, dayDiff, type BankRow, type MatchItem } from "./matcher";
import { summarize, type ReconciliationSummary, type SummaryItem } from "./summary";

export const DEFAULT_DATE_WINDOW_DAYS = 3;
const MAX_DERIVE_BALANCE_DAYS = 400;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dec = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toFixed(2));

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in Singapore (the server runs in UTC). */
export function sgtTodayIso(nowMs = Date.now()): string {
  return new Date(nowMs + 8 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * "Latest period" for the weekly job: the calendar month holding the most recent imported
 * statement row, from the 1st up to that row's date (statements are uploaded by hand, so
 * the bank side is only complete up to the last upload). `month` (YYYY-MM) overrides it
 * with that whole month.
 */
export function latestPeriod(latestBankDate: string | null, todayIso: string, month?: string | null): { start: string; end: string } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start: `${month}-01`, end };
  }
  const anchor = latestBankDate ?? todayIso;
  return { start: `${anchor.slice(0, 7)}-01`, end: anchor };
}

function itemKey(bankId: string | null | undefined, qbType: string | null | undefined, qbId: string | null | undefined): string {
  return `${bankId ?? ""}|${qbType && qbId ? `${qbType}:${qbId}` : ""}`;
}

interface CarryOver {
  forced: Map<string, string>; // bankId -> qbKey
  forbidden: Set<string>; // pairKey
  reviews: Map<string, { reviewed: boolean; reviewNote: string | null; reviewedById: string | null; reviewedAt: Date | null }>;
}

async function loadCarryOver(qbAccountId: string, start: string, end: string): Promise<CarryOver> {
  const runs = await prisma.bankReconciliation.findMany({
    where: { qbAccountId, status: "COMPLETED", periodStart: { lte: toDate(end) }, periodEnd: { gte: toDate(start) } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true },
  });
  const co: CarryOver = { forced: new Map(), forbidden: new Set(), reviews: new Map() };
  if (!runs.length) return co;
  const items = await prisma.bankReconciliationItem.findMany({
    where: {
      reconciliationId: { in: runs.map((r) => r.id) },
      OR: [{ matchMethod: "MANUAL" }, { unmatchedPairKey: { not: null } }, { reviewed: true }, { reviewNote: { not: null } }],
    },
    select: {
      reconciliationId: true, matchMethod: true, bankTransactionId: true, qbTxnType: true, qbTxnId: true,
      unmatchedPairKey: true, reviewed: true, reviewNote: true, reviewedById: true, reviewedAt: true, updatedAt: true,
    },
  });
  const order = new Map(runs.map((r, i) => [r.id, i]));
  items.sort((a, b) => order.get(a.reconciliationId)! - order.get(b.reconciliationId)! || a.updatedAt.getTime() - b.updatedAt.getTime());
  for (const it of items) {
    if (it.matchMethod === "MANUAL" && it.bankTransactionId && it.qbTxnType && it.qbTxnId) {
      const k = `${it.qbTxnType}:${it.qbTxnId}`;
      co.forced.set(it.bankTransactionId, k);
      co.forbidden.delete(pairKey(it.bankTransactionId, k));
    }
    if (it.unmatchedPairKey) {
      co.forbidden.add(it.unmatchedPairKey);
      const [bankId, k] = it.unmatchedPairKey.split("|");
      if (co.forced.get(bankId) === k) co.forced.delete(bankId);
    }
    if (it.reviewed || it.reviewNote) {
      co.reviews.set(itemKey(it.bankTransactionId, it.qbTxnType, it.qbTxnId), {
        reviewed: it.reviewed, reviewNote: it.reviewNote, reviewedById: it.reviewedById, reviewedAt: it.reviewedAt,
      });
    }
  }
  return co;
}

function toBankRow(t: {
  id: string; paymentDate: Date; amount: Prisma.Decimal; direction: string; title: string; rawDescription: string;
  paymentRef: string | null; invoiceNo: string | null; qbExpenseId: string | null; qbExpenseNo: string | null;
}): BankRow {
  return {
    id: t.id,
    date: isoOf(t.paymentDate)!,
    amount: t.amount.toFixed(2),
    direction: t.direction === "CREDIT" ? "CREDIT" : "DEBIT",
    title: t.title,
    rawDescription: t.rawDescription,
    paymentRef: t.paymentRef,
    invoiceNo: t.invoiceNo,
    qbExpenseId: t.qbExpenseId,
    qbExpenseNo: t.qbExpenseNo,
  };
}

function itemData(runId: string, m: MatchItem, forbidden: Set<string>) {
  let unmatchedPairKey: string | null = null;
  if (m.status === "UNMATCHED_BANK" && m.bank) {
    unmatchedPairKey = Array.from(forbidden).find((k) => k.startsWith(`${m.bank!.id}|`)) ?? null;
  } else if (m.status === "UNMATCHED_QB" && m.qb) {
    const k = qbKey(m.qb);
    unmatchedPairKey = Array.from(forbidden).find((p) => p.endsWith(`|${k}`)) ?? null;
  }
  return {
    reconciliationId: runId,
    status: m.status,
    matchMethod: m.method,
    confidence: m.confidence,
    bankTransactionId: m.bank?.id ?? null,
    bankDate: m.bank ? toDate(m.bank.date) : null,
    bankAmount: m.bank ? new Prisma.Decimal(m.bank.amount) : null,
    bankDirection: m.bank?.direction ?? null,
    bankDescription: m.bank ? `${m.bank.title} — ${m.bank.rawDescription}`.slice(0, 500) : null,
    qbTxnType: m.qb?.qbTxnType ?? null,
    qbTxnId: m.qb?.qbTxnId ?? null,
    qbDate: m.qb ? toDate(m.qb.date) : null,
    qbAmount: m.qb ? new Prisma.Decimal(m.qb.amount) : null,
    qbDirection: m.qb?.direction ?? null,
    qbDocNumber: m.qb?.docNumber || null,
    qbPayee: m.qb?.payee || null,
    qbMemo: m.qb?.memo ? m.qb.memo.slice(0, 500) : null,
    amountDifference: m.amountDifference !== null ? new Prisma.Decimal(m.amountDifference) : null,
    dayDifference: m.dayDifference,
    unmatchedPairKey,
  };
}

export interface CreateRunInput {
  periodStart: string;
  periodEnd: string;
  qbAccountId?: string | null;
  bankClosingBalance?: string | null;
  dateWindowDays?: number;
  trigger: "MANUAL" | "SCHEDULED";
  createdById?: string | null;
}

/**
 * Derive the QBO account balance as at `periodEnd`: CurrentBalance minus every movement
 * dated after periodEnd (QBO's CurrentBalance includes future-dated transactions too).
 */
async function deriveQbBalanceAt(
  client: ReturnType<typeof createQuickBooksClient>,
  accountId: string,
  currentBalance: string,
  periodEnd: string,
  todayIso: string,
): Promise<{ balance: string | null; basis: string | null; warning?: string }> {
  if (dayDiff(periodEnd, todayIso) > MAX_DERIVE_BALANCE_DAYS) {
    return { balance: null, basis: null, warning: `QuickBooks balance not derived: period ends more than ${MAX_DERIVE_BALANCE_DAYS} days ago.` };
  }
  const later = await fetchQbBankActivity(client, accountId, addDays(periodEnd, 1), addDays(todayIso, 366));
  let bal = new Decimal(currentBalance);
  for (const t of later.txns) bal = bal.minus(signed(t.amount, t.direction));
  return { balance: bal.toFixed(2), basis: "DERIVED", warning: later.warnings[0] };
}

export async function createReconciliationRun(input: CreateRunInput): Promise<string> {
  const { periodStart, periodEnd } = input;
  if (!ISO.test(periodStart) || !ISO.test(periodEnd)) throw new Error("periodStart and periodEnd must be YYYY-MM-DD");
  if (periodStart > periodEnd) throw new Error("periodStart must be on or before periodEnd");
  if (dayDiff(periodStart, periodEnd) > 92) throw new Error("A reconciliation period can be at most 3 months");
  const window = Math.min(Math.max(0, Math.trunc(input.dateWindowDays ?? DEFAULT_DATE_WINDOW_DAYS)), 10);
  let bankClosing: Prisma.Decimal | null = null;
  if (input.bankClosingBalance !== undefined && input.bankClosingBalance !== null && String(input.bankClosingBalance).trim() !== "") {
    const s = String(input.bankClosingBalance).replace(/[,\s]/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error("bankClosingBalance must be a number with up to 2 decimals");
    bankClosing = new Prisma.Decimal(s);
  }

  const run = await prisma.bankReconciliation.create({
    data: {
      periodStart: toDate(periodStart),
      periodEnd: toDate(periodEnd),
      status: "RUNNING",
      trigger: input.trigger,
      dateWindowDays: window,
      bankClosingBalance: bankClosing,
      createdById: input.createdById ?? null,
    },
    select: { id: true },
  });

  try {
    const client = createQuickBooksClient();
    const accounts = await listQbBankAccounts(client);
    const account = input.qbAccountId ? accounts.find((a) => a.id === String(input.qbAccountId)) : pickDefaultBankAccount(accounts);
    if (!account) throw new Error(input.qbAccountId ? `QuickBooks bank account ${input.qbAccountId} not found` : "No bank account found in QuickBooks");

    const warnings: string[] = [];
    const [bankTxns, activity, carry] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { paymentDate: { gte: toDate(periodStart), lte: toDate(periodEnd) } },
        select: {
          id: true, paymentDate: true, amount: true, direction: true, title: true, rawDescription: true,
          paymentRef: true, invoiceNo: true, qbExpenseId: true, qbExpenseNo: true,
        },
        orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
      }),
      fetchQbBankActivity(client, account.id, addDays(periodStart, -window), addDays(periodEnd, window)),
      loadCarryOver(account.id, periodStart, periodEnd),
    ]);
    warnings.push(...activity.warnings);

    const banks = bankTxns.map(toBankRow);
    const matched = matchTransactions(banks, activity.txns, {
      dateWindowDays: window,
      forcedPairs: Array.from(carry.forced).map(([bankId, k]) => ({ bankId, qbKey: k })),
      forbiddenPairs: carry.forbidden,
    });
    // QB rows fetched only for the date window that stayed unmatched belong to a neighbouring period.
    const items = matched.filter((m) => !(m.status === "UNMATCHED_QB" && m.qb && (m.qb.date < periodStart || m.qb.date > periodEnd)));

    const today = sgtTodayIso();
    const bal = await deriveQbBalanceAt(client, account.id, account.currentBalance, periodEnd, today).catch((err) => ({
      balance: null as string | null,
      basis: null as string | null,
      warning: `QuickBooks balance not derived: ${err instanceof Error ? err.message : String(err)}`,
    }));
    if (bal.warning) warnings.push(bal.warning);

    const rows = items.map((m) => {
      const d = itemData(run.id, m, carry.forbidden);
      const rv = carry.reviews.get(itemKey(d.bankTransactionId, d.qbTxnType, d.qbTxnId));
      return rv ? { ...d, ...rv } : d;
    });
    for (let i = 0; i < rows.length; i += 500) {
      await prisma.bankReconciliationItem.createMany({ data: rows.slice(i, i + 500) });
    }

    const summary = summarize(rows.map(toSummaryItem), { start: periodStart, end: periodEnd }, {
      bankClosingBalance: dec(bankClosing),
      qbClosingBalance: bal.balance,
    });
    await prisma.bankReconciliation.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        qbAccountId: account.id,
        qbAccountName: account.name,
        qbClosingBalance: bal.balance !== null ? new Prisma.Decimal(bal.balance) : null,
        qbBalanceBasis: bal.basis,
        warnings,
        ...summaryColumns(summary),
      },
    });
    return run.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.bankReconciliation.update({ where: { id: run.id }, data: { status: "FAILED", error: message.slice(0, 2000) } }).catch(() => {});
    throw err;
  }
}

function toSummaryItem(r: {
  status: string; bankAmount: Prisma.Decimal | null; bankDirection: string | null; qbAmount: Prisma.Decimal | null;
  qbDirection: string | null; qbDate: Date | null; reviewed?: boolean;
}): SummaryItem {
  return {
    status: r.status,
    bankAmount: dec(r.bankAmount),
    bankDirection: r.bankDirection,
    qbAmount: dec(r.qbAmount),
    qbDirection: r.qbDirection,
    qbDate: isoOf(r.qbDate),
    reviewed: r.reviewed ?? false,
  };
}

function summaryColumns(s: ReconciliationSummary) {
  return {
    bankInflow: new Prisma.Decimal(s.bankInflow),
    bankOutflow: new Prisma.Decimal(s.bankOutflow),
    qbInflow: new Prisma.Decimal(s.qbInflow),
    qbOutflow: new Prisma.Decimal(s.qbOutflow),
    bankCount: s.bankCount,
    qbCount: s.qbCount,
    matchedCount: s.matchedCount,
    mismatchCount: s.mismatchCount,
    unmatchedBankCount: s.unmatchedBankCount,
    unmatchedQbCount: s.unmatchedQbCount,
    reviewedCount: s.reviewedCount,
  };
}

/** Recompute the stored counters/totals after a manual change. */
export async function recomputeRun(runId: string): Promise<ReconciliationSummary> {
  const run = await prisma.bankReconciliation.findUniqueOrThrow({ where: { id: runId } });
  const items = await prisma.bankReconciliationItem.findMany({ where: { reconciliationId: runId } });
  const s = summarize(items.map(toSummaryItem), { start: isoOf(run.periodStart)!, end: isoOf(run.periodEnd)! }, {
    bankClosingBalance: dec(run.bankClosingBalance),
    qbClosingBalance: dec(run.qbClosingBalance),
  });
  await prisma.bankReconciliation.update({ where: { id: runId }, data: summaryColumns(s) });
  return s;
}

export class ReconciliationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export async function manualMatch(runId: string, bankItemId: string, qbItemId: string, actorId: string | null) {
  await prisma.$transaction(async (tx) => {
    const [b, q] = await Promise.all([
      tx.bankReconciliationItem.findUnique({ where: { id: bankItemId } }),
      tx.bankReconciliationItem.findUnique({ where: { id: qbItemId } }),
    ]);
    if (!b || !q || b.reconciliationId !== runId || q.reconciliationId !== runId) throw new ReconciliationError("Items not found in this run", 404);
    if (b.status !== "UNMATCHED_BANK" || q.status !== "UNMATCHED_QB") {
      throw new ReconciliationError("Pick one 'unmatched in bank' row and one 'unmatched in QuickBooks' row");
    }
    if (b.bankDirection !== q.qbDirection) throw new ReconciliationError("Direction differs: a deposit can only match a deposit, a payment a payment");
    const diff = new Decimal(b.bankAmount!.toFixed(2)).minus(q.qbAmount!.toFixed(2));
    await tx.bankReconciliationItem.update({
      where: { id: b.id },
      data: {
        status: diff.isZero() ? "MATCHED" : "AMOUNT_MISMATCH",
        matchMethod: "MANUAL",
        confidence: 100,
        qbTxnType: q.qbTxnType, qbTxnId: q.qbTxnId, qbDate: q.qbDate, qbAmount: q.qbAmount, qbDirection: q.qbDirection,
        qbDocNumber: q.qbDocNumber, qbPayee: q.qbPayee, qbMemo: q.qbMemo,
        amountDifference: new Prisma.Decimal(diff.toFixed(2)),
        dayDifference: b.bankDate && q.qbDate ? dayDiff(isoOf(b.bankDate)!, isoOf(q.qbDate)!) : null,
        unmatchedPairKey: null,
        reviewed: b.reviewed || q.reviewed,
        reviewNote: [b.reviewNote, q.reviewNote].filter(Boolean).join(" / ") || null,
        reviewedById: b.reviewedById ?? q.reviewedById ?? (b.reviewed || q.reviewed ? actorId : null),
        reviewedAt: b.reviewedAt ?? q.reviewedAt,
      },
    });
    await tx.bankReconciliationItem.delete({ where: { id: q.id } });
  });
  return recomputeRun(runId);
}

export async function unmatchItem(runId: string, itemId: string) {
  await prisma.$transaction(async (tx) => {
    const it = await tx.bankReconciliationItem.findUnique({ where: { id: itemId } });
    if (!it || it.reconciliationId !== runId) throw new ReconciliationError("Item not found in this run", 404);
    if ((it.status !== "MATCHED" && it.status !== "AMOUNT_MISMATCH") || !it.bankTransactionId || !it.qbTxnId) {
      throw new ReconciliationError("Only matched rows can be un-matched");
    }
    const key = pairKey(it.bankTransactionId, `${it.qbTxnType}:${it.qbTxnId}`);
    await tx.bankReconciliationItem.create({
      data: {
        reconciliationId: runId,
        status: "UNMATCHED_QB",
        qbTxnType: it.qbTxnType, qbTxnId: it.qbTxnId, qbDate: it.qbDate, qbAmount: it.qbAmount, qbDirection: it.qbDirection,
        qbDocNumber: it.qbDocNumber, qbPayee: it.qbPayee, qbMemo: it.qbMemo,
        unmatchedPairKey: key,
      },
    });
    await tx.bankReconciliationItem.update({
      where: { id: it.id },
      data: {
        status: "UNMATCHED_BANK", matchMethod: null, confidence: null,
        qbTxnType: null, qbTxnId: null, qbDate: null, qbAmount: null, qbDirection: null, qbDocNumber: null, qbPayee: null, qbMemo: null,
        amountDifference: null, dayDifference: null, unmatchedPairKey: key,
        reviewed: false, reviewNote: it.reviewNote, reviewedById: null, reviewedAt: null,
      },
    });
  });
  return recomputeRun(runId);
}

export async function reviewItem(runId: string, itemId: string, reviewed: boolean, note: string | null, actorId: string | null) {
  const it = await prisma.bankReconciliationItem.findUnique({ where: { id: itemId }, select: { reconciliationId: true } });
  if (!it || it.reconciliationId !== runId) throw new ReconciliationError("Item not found in this run", 404);
  await prisma.bankReconciliationItem.update({
    where: { id: itemId },
    data: {
      reviewed,
      reviewNote: note?.trim() ? note.trim().slice(0, 1000) : null,
      reviewedById: reviewed ? actorId : null,
      reviewedAt: reviewed ? new Date() : null,
    },
  });
  return recomputeRun(runId);
}

// ── Read models ──────────────────────────────────────────────────────────────

export function serializeRunRow(r: Awaited<ReturnType<typeof prisma.bankReconciliation.findFirstOrThrow>>) {
  return {
    id: r.id,
    periodStart: isoOf(r.periodStart)!,
    periodEnd: isoOf(r.periodEnd)!,
    bankAccountLabel: r.bankAccountLabel,
    qbAccountId: r.qbAccountId,
    qbAccountName: r.qbAccountName,
    status: r.status,
    trigger: r.trigger,
    dateWindowDays: r.dateWindowDays,
    bankClosingBalance: dec(r.bankClosingBalance),
    qbClosingBalance: dec(r.qbClosingBalance),
    qbBalanceBasis: r.qbBalanceBasis,
    bankCount: r.bankCount,
    qbCount: r.qbCount,
    matchedCount: r.matchedCount,
    mismatchCount: r.mismatchCount,
    unmatchedBankCount: r.unmatchedBankCount,
    unmatchedQbCount: r.unmatchedQbCount,
    reviewedCount: r.reviewedCount,
    matchRate: r.bankCount ? Math.round(((r.matchedCount + r.mismatchCount) / r.bankCount) * 1000) / 10 : 0,
    warnings: r.warnings,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
}
export type RunRow = ReturnType<typeof serializeRunRow>;

export async function listRuns(limit = 50): Promise<RunRow[]> {
  const rows = await prisma.bankReconciliation.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(serializeRunRow);
}

export async function getRunDetail(runId: string) {
  const run = await prisma.bankReconciliation.findUnique({ where: { id: runId } });
  if (!run) return null;
  const items = await prisma.bankReconciliationItem.findMany({
    where: { reconciliationId: runId },
    orderBy: [{ bankDate: "asc" }, { qbDate: "asc" }, { id: "asc" }],
  });
  const summary = summarize(items.map(toSummaryItem), { start: isoOf(run.periodStart)!, end: isoOf(run.periodEnd)! }, {
    bankClosingBalance: dec(run.bankClosingBalance),
    qbClosingBalance: dec(run.qbClosingBalance),
  });
  return {
    run: serializeRunRow(run),
    summary,
    items: items.map((i) => ({
      id: i.id,
      status: i.status,
      matchMethod: i.matchMethod,
      confidence: i.confidence,
      bankTransactionId: i.bankTransactionId,
      bankDate: isoOf(i.bankDate),
      bankAmount: dec(i.bankAmount),
      bankDirection: i.bankDirection,
      bankDescription: i.bankDescription,
      qbTxnType: i.qbTxnType,
      qbTxnId: i.qbTxnId,
      qbDate: isoOf(i.qbDate),
      qbAmount: dec(i.qbAmount),
      qbDirection: i.qbDirection,
      qbDocNumber: i.qbDocNumber,
      qbPayee: i.qbPayee,
      qbMemo: i.qbMemo,
      amountDifference: dec(i.amountDifference),
      dayDifference: i.dayDifference,
      wasUnmatched: !!i.unmatchedPairKey,
      reviewed: i.reviewed,
      reviewNote: i.reviewNote,
      reviewedAt: i.reviewedAt?.toISOString() ?? null,
    })),
  };
}
export type RunDetail = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>;
export type RunItem = RunDetail["items"][number];

export type { QbBankTxn };
