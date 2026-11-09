import { NextResponse } from "next/server";
import { getFinanceActor } from "@/lib/finance-access";
import { getRunDetail } from "@/lib/reconciliation/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const detail = await getRunDetail(params.id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}
