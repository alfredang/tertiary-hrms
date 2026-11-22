import { NextResponse } from "next/server";
import { getFinanceActor } from "@/lib/finance-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/mobile/finance/statements — admin / accountant.
// Every bank statement import (one importBatchId each), newest first: when it was imported, the bank
// dates it covers, and its credits and debits. Feeds the apps' "Bank statements" detail (22 Nov 2026).
export async function GET() {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.bankTransaction.groupBy({
    by: ["importBatchId", "direction"],
    _count: { _all: true },
    _sum: { amount: true },
    _min: { paymentDate: true, createdAt: true },
    _max: { paymentDate: true, statementRef: true },
  });

  type Batch = {
    batchId: string; importedAt: string | null; from: string | null; to: string | null;
    credits: number; debits: number; creditTotal: number; debitTotal: number; statementRef: string | null;
  };
  const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  const byBatch = new Map<string, Batch>();
  for (const g of groups) {
    const b = byBatch.get(g.importBatchId) ?? {
      batchId: g.importBatchId, importedAt: null, from: null, to: null,
      credits: 0, debits: 0, creditTotal: 0, debitTotal: 0, statementRef: null,
    };
    const at = g._min.createdAt?.toISOString() ?? null;
    if (at && (!b.importedAt || at < b.importedAt)) b.importedAt = at;
    const from = ymd(g._min.paymentDate);
    const to = ymd(g._max.paymentDate);
    if (from && (!b.from || from < b.from)) b.from = from;
    if (to && (!b.to || to > b.to)) b.to = to;
    const sum = Number(g._sum.amount ?? 0);
    if (g.direction === "CREDIT") { b.credits += g._count._all; b.creditTotal += sum; }
    else { b.debits += g._count._all; b.debitTotal += sum; }
    b.statementRef = b.statementRef ?? g._max.statementRef ?? null;
    byBatch.set(g.importBatchId, b);
  }
  const imports = Array.from(byBatch.values())
    .map((b) => ({ ...b, creditTotal: Math.round(b.creditTotal * 100) / 100, debitTotal: Math.round(b.debitTotal * 100) / 100 }))
    .sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""));
  return NextResponse.json({ imports });
}
