import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFinanceActor } from "@/lib/finance-access";
import { ReconciliationError, reviewItem } from "@/lib/reconciliation/service";

export const dynamic = "force-dynamic";

const schema = z.object({ reviewed: z.boolean(), reviewNote: z.string().max(1000).optional().nullable() });

/** Mark a reconciliation row as reviewed (or not), with an optional note. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "reviewed (boolean) is required" }, { status: 400 });
  try {
    const summary = await reviewItem(params.id, params.itemId, parsed.data.reviewed, parsed.data.reviewNote ?? null, actor.userId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const status = err instanceof ReconciliationError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status });
  }
}
