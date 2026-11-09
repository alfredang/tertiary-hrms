import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFinanceActor } from "@/lib/finance-access";
import { manualMatch, ReconciliationError } from "@/lib/reconciliation/service";

export const dynamic = "force-dynamic";

const schema = z.object({ bankItemId: z.string().min(1), qbItemId: z.string().min(1) });

/** Manually pair an "unmatched in bank" row with an "unmatched in QuickBooks" row. HRMS-only; QuickBooks is not written. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bankItemId and qbItemId are required" }, { status: 400 });
  try {
    const summary = await manualMatch(params.id, parsed.data.bankItemId, parsed.data.qbItemId, actor.userId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const status = err instanceof ReconciliationError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Match failed" }, { status });
  }
}
