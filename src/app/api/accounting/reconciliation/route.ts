import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFinanceActor } from "@/lib/finance-access";
import { createReconciliationRun, listRuns } from "@/lib/reconciliation/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ runs: await listRuns(50) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load runs" }, { status: 500 });
  }
}

const createSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qbAccountId: z.string().max(40).optional().nullable(),
  bankClosingBalance: z.string().max(30).optional().nullable(),
  dateWindowDays: z.number().int().min(0).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  try {
    const id = await createReconciliationRun({ ...parsed.data, trigger: "MANUAL", createdById: actor.userId });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reconciliation failed" }, { status: 502 });
  }
}
