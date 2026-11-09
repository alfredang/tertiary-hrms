import { getFinanceActor } from "@/lib/finance-access";
import { getRunDetail, listRuns, type RunDetail, type RunRow } from "@/lib/reconciliation/service";
import { getHealthHistory } from "@/lib/quickbooks/health";
import { ReconciliationView } from "@/components/accounting/reconciliation/reconciliation-view";

export const dynamic = "force-dynamic";

export default async function BankReconciliationPage({ searchParams }: { searchParams?: { run?: string } }) {
  const actor = await getFinanceActor();
  if (!actor.allowed) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Bank Reconciliation</h1>
        <p className="text-sm text-gray-400">You do not have access to this section.</p>
      </div>
    );
  }

  let runs: RunRow[] = [];
  let detail: RunDetail | null = null;
  let dbReady = true;
  try {
    runs = await listRuns(50);
    const wanted = searchParams?.run && runs.some((r) => r.id === searchParams.run) ? searchParams.run : runs.find((r) => r.status === "COMPLETED")?.id;
    if (wanted) detail = await getRunDetail(wanted);
  } catch {
    // Reconciliation tables not pushed yet (npm run db:push).
    dbReady = false;
  }
  const health = await getHealthHistory(14);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Bank Reconciliation</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Match imported DBS statement rows against the transactions recorded in QuickBooks for the same bank account.
          QuickBooks is read only: matching, notes and reviews are stored in the HRMS.
        </p>
      </div>
      <ReconciliationView initialRuns={runs} initialDetail={detail} initialHealth={health} dbReady={dbReady} />
    </div>
  );
}
