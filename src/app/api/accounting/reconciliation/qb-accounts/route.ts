import { NextResponse } from "next/server";
import { getFinanceActor } from "@/lib/finance-access";
import { createQuickBooksClient } from "@/lib/quickbooks/store";
import { listQbBankAccounts, pickDefaultBankAccount } from "@/lib/quickbooks/bank-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** QuickBooks bank accounts (read-only) for the reconciliation account picker. */
export async function GET() {
  const actor = await getFinanceActor();
  if (!actor.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const accounts = await listQbBankAccounts(createQuickBooksClient());
    return NextResponse.json({ accounts, defaultId: pickDefaultBankAccount(accounts)?.id ?? null });
  } catch (err) {
    return NextResponse.json({ accounts: [], defaultId: null, error: err instanceof Error ? err.message : "QuickBooks unavailable" }, { status: 502 });
  }
}
