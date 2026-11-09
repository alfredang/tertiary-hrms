import { NextResponse } from "next/server";
import { getFinanceActor } from "@/lib/finance-access";
import { getHealthHistory, runQuickBooksHealthCheck } from "@/lib/quickbooks/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Liveness history for the health badge. */
export async function GET() {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ history: await getHealthHistory(30) });
}

/** Run the liveness check now (read-only against QuickBooks). */
export async function POST() {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runQuickBooksHealthCheck({ trigger: "MANUAL" });
  return NextResponse.json({ result });
}
