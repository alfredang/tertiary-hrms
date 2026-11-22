import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { getFinanceActor } from "@/lib/finance-access";
import { prisma } from "@/lib/prisma";
import { singaporePeriod } from "@/lib/dashboard-kpis";

export const dynamic = "force-dynamic";

// GET /api/mobile/finance/transactions?direction=CREDIT|DEBIT&month=YYYY-MM — admin / accountant.
// One month of bank credits (income) or debits (expenses), newest first, for the apps' accountant
// Home (Alfred, 22 Nov 2026). Same rows as Income / Expense Tracking; `month` defaults to this month (SGT).
export async function GET(req: Request) {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const direction = params.get("direction") === "CREDIT" ? "CREDIT" : "DEBIT";
  const { year, monthStart } = singaporePeriod(new Date());
  const m = /^(\d{4})-(\d{2})$/.exec(params.get("month") ?? "");
  const y = m ? Number(m[1]) : year;
  const mo = m ? Number(m[2]) - 1 : monthStart.getUTCMonth();
  if (mo < 0 || mo > 11) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  const from = new Date(Date.UTC(y, mo, 1));
  const to = new Date(Date.UTC(y, mo + 1, 1));

  const rows = await prisma.bankTransaction.findMany({
    where: { direction, paymentDate: { gte: from, lt: to } },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, paymentDate: true, title: true, amount: true, direction: true, type: true,
      paymentType: true, paymentRef: true, invoiceNo: true, status: true, remarks: true,
      rawDescription: true, statementRef: true,
    },
  });
  const total = rows.reduce((t, r) => t.plus(new Decimal(r.amount.toString())), new Decimal(0));
  return NextResponse.json({
    month: `${y}-${String(mo + 1).padStart(2, "0")}`,
    direction,
    count: rows.length,
    total: total.toDecimalPlaces(2).toNumber(),
    transactions: rows.map((r) => ({
      ...r,
      paymentDate: r.paymentDate.toISOString().slice(0, 10),
      amount: Number(r.amount),
    })),
  });
}
