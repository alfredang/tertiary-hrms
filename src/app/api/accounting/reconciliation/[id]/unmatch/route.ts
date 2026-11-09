import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFinanceActor } from "@/lib/finance-access";
import { ReconciliationError, unmatchItem } from "@/lib/reconciliation/service";

export const dynamic = "force-dynamic";

const schema = z.object({ itemId: z.string().min(1) });

/** Split a matched pair back into two unmatched rows; later runs will not auto-pair them again. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  try {
    const summary = await unmatchItem(params.id, parsed.data.itemId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const status = err instanceof ReconciliationError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unmatch failed" }, { status });
  }
}
