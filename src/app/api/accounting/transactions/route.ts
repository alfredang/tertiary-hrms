import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { computeDedupeKey } from "@/lib/parse-excel-statement";

export const dynamic = "force-dynamic";

async function authorize() {
  if (isDevAuthSkipped()) return { ok: true, userId: null as string | null };
  const session = await auth();
  if (!session?.user) return { ok: false, userId: null };
  const role = (session.user as any).role as string | undefined;
  const roles = ((session.user as any).roles as string[] | undefined) ?? [];
  const ok = hasAdminAccess(role) || roles.includes("ACCOUNTANT");
  return { ok, userId: (session.user as any).id ?? null };
}

export async function GET(req: NextRequest) {
  const { ok } = await authorize();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const direction = req.nextUrl.searchParams.get("direction"); // DEBIT | CREDIT | null
  const where = direction ? { direction } : {};

  const transactions = await prisma.bankTransaction.findMany({
    where,
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  return NextResponse.json({ transactions });
}

export async function POST(req: NextRequest) {
  const { ok, userId } = await authorize();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: any[] = Array.isArray(body?.transactions) ? body.transactions : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No transactions to save" }, { status: 400 });
  }

  const batchId = randomUUID();
  const seen = new Set<string>();
  const data = [];
  for (const r of rows) {
    const direction = r.direction === "CREDIT" ? "CREDIT" : "DEBIT";
    const amount = Number(r.amount) || 0;
    const paymentDate = String(r.paymentDate).slice(0, 10);
    const rawDescription = String(r.rawDescription ?? r.title ?? "").slice(0, 2000);
    const dedupeKey = computeDedupeKey({
      paymentDate,
      amount,
      direction,
      rawDescription,
    });
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    data.push({
      paymentDate: new Date(paymentDate),
      title: String(r.title ?? "").slice(0, 250),
      amount,
      direction,
      type: String(r.type ?? "Other").slice(0, 60),
      paymentType: String(r.paymentType ?? "Bank Transfer").slice(0, 40),
      paymentRef: r.paymentRef ? String(r.paymentRef).slice(0, 120) : null,
      invoiceNo: r.invoiceNo ? String(r.invoiceNo).slice(0, 80) : null,
      status: String(r.status ?? "Pending").slice(0, 30),
      gstIncluded: Boolean(r.gstIncluded),
      recurring: String(r.recurring ?? "One Time").slice(0, 30),
      remarks: r.remarks ? String(r.remarks).slice(0, 500) : null,
      rawDescription,
      statementRef: r.statementRef ? String(r.statementRef).slice(0, 120) : null,
      dedupeKey,
      importBatchId: batchId,
      uploadedById: userId,
    });
  }

  // PRE-INSERT HOOK: detect duplicates against existing DB rows so we can
  // report exactly which incoming rows collide (the unique-key index also
  // enforces this, but checking up front gives an accurate skipped count).
  const existing = await prisma.bankTransaction.findMany({
    where: { dedupeKey: { in: data.map((d) => d.dedupeKey) } },
    select: {
      dedupeKey: true,
      id: true,
      status: true,
      qbExpenseNo: true,
      qbExpenseId: true,
      direction: true,
      paymentDate: true,
      title: true,
      amount: true,
      type: true,
      paymentType: true,
      paymentRef: true,
      invoiceNo: true,
      receiptNo: true,
      gstIncluded: true,
      remarks: true,
    },
  });
  const existingKeys = new Set(existing.map((e) => e.dedupeKey));
  const fresh = data.filter((d) => !existingKeys.has(d.dedupeKey));

  const result = await prisma.bankTransaction.createMany({
    data: fresh,
    skipDuplicates: true,
  });

  // POST-INSERT HOOK: verify every fresh row landed in the DB. If the
  // createMany count doesn't match, surface the mismatch instead of
  // silently dropping rows.
  const persisted = await prisma.bankTransaction.count({
    where: { importBatchId: batchId },
  });
  const verified = persisted === result.count && persisted === fresh.length;

  // Return full details for already-existing records so the UI can display
  // their current QB status without a separate fetch.
  const existingRows = existing.map((e) => ({
    id: e.id,
    paymentDate: e.paymentDate.toISOString().slice(0, 10),
    title: e.title,
    amount: Number(e.amount),
    type: e.type,
    paymentType: e.paymentType,
    paymentRef: e.paymentRef ?? "",
    invoiceNo: e.invoiceNo ?? "",
    receiptNo: e.receiptNo ?? "",
    qbExpenseNo: e.qbExpenseNo ?? "",
    status: e.status,
    gstIncluded: e.gstIncluded,
    remarks: e.remarks ?? "",
    direction: e.direction,
  }));

  return NextResponse.json({
    submitted: data.length,
    fresh: fresh.length,
    saved: result.count,
    skipped: existingKeys.size,
    persisted,
    verified,
    batchId,
    existingRows,
  });
}
