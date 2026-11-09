"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RefreshCw, Link2, Unlink, CheckCircle2, AlertTriangle, XCircle, HelpCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { RunDetail, RunItem, RunRow } from "@/lib/reconciliation/service";
import type { getHealthHistory } from "@/lib/quickbooks/health";

type HealthRow = Awaited<ReturnType<typeof getHealthHistory>>[number];
type Tab = "MATCHED" | "AMOUNT_MISMATCH" | "UNMATCHED_BANK" | "UNMATCHED_QB";
interface QbAccount { id: string; name: string; currentBalance: string; active: boolean }

const TABS: { id: Tab; label: string }[] = [
  { id: "UNMATCHED_BANK", label: "Unmatched in bank" },
  { id: "UNMATCHED_QB", label: "Unmatched in QuickBooks" },
  { id: "AMOUNT_MISMATCH", label: "Amount mismatches" },
  { id: "MATCHED", label: "Matched" },
];

// Display-only conversion: the values are exact decimal strings from the server.
const money = (v: string | null | undefined) => (v === null || v === undefined ? "—" : formatCurrency(Number(v)));
const sgDate = (iso: string) => new Date(iso).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" });

function monthStart(): string {
  const d = new Date(Date.now() + 8 * 3_600_000);
  return `${d.toISOString().slice(0, 7)}-01`;
}
function todaySgt(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export function HealthBadge({ health, onCheck, checking }: { health: HealthRow | null; onCheck: () => void; checking: boolean }) {
  const status = health?.status ?? "UNKNOWN";
  const style =
    status === "OK"
      ? "bg-green-900/30 text-green-300 border-green-800"
      : status === "WARN"
        ? "bg-amber-900/30 text-amber-300 border-amber-800"
        : status === "FAIL"
          ? "bg-red-900/30 text-red-300 border-red-800"
          : "bg-gray-900 text-gray-400 border-gray-800";
  const Icon = status === "OK" ? CheckCircle2 : status === "WARN" ? AlertTriangle : status === "FAIL" ? XCircle : HelpCircle;
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${style}`}>
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold">
            QuickBooks {status === "UNKNOWN" ? "health not checked yet" : status}
            {health?.companyName ? ` · ${health.companyName}` : ""}
          </p>
          {health && (
            <p className="text-xs opacity-80 mt-0.5 break-words">
              {sgDate(health.checkedAt)} · {health.mode}
              {health.latencyMs !== null ? ` · ${health.latencyMs} ms` : ""}
              {health.daysToRefreshExpiry !== null ? ` · refresh token ${health.daysToRefreshExpiry} days left` : ""}
              {health.message ? ` · ${health.message}` : ""}
            </p>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onCheck} disabled={checking} className="shrink-0">
        {checking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
        Check now
      </Button>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-green-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-white";
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "border-t border-gray-800 mt-1 pt-2 font-semibold text-white" : "text-gray-300"}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function ReconciliationView({
  initialRuns,
  initialDetail,
  initialHealth,
  dbReady,
}: {
  initialRuns: RunRow[];
  initialDetail: RunDetail | null;
  initialHealth: HealthRow[];
  dbReady: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [detail, setDetail] = useState<RunDetail | null>(initialDetail);
  const [health, setHealth] = useState<HealthRow | null>(initialHealth[0] ?? null);
  const [checking, setChecking] = useState(false);
  const [accounts, setAccounts] = useState<QbAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [form, setForm] = useState({ periodStart: monthStart(), periodEnd: todaySgt(), qbAccountId: "", bankClosingBalance: "", dateWindowDays: 3 });
  const [creating, setCreating] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [tab, setTab] = useState<Tab>("UNMATCHED_BANK");
  const [hideReviewed, setHideReviewed] = useState(false);
  const [search, setSearch] = useState("");
  const [selBank, setSelBank] = useState<string | null>(null);
  const [selQb, setSelQb] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (!dbReady) return;
    api<{ accounts: QbAccount[]; defaultId: string | null; error?: string }>("/api/accounting/reconciliation/qb-accounts")
      .then((r) => {
        setAccounts(r.accounts);
        setForm((f) => ({ ...f, qbAccountId: f.qbAccountId || r.defaultId || "" }));
      })
      .catch((e) => setAccountsError(e.message));
  }, [dbReady]);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const { result } = await api<{ result: HealthRow }>("/api/quickbooks/health", { method: "POST" });
      setHealth(result);
      toast({ title: `QuickBooks ${result.status}`, description: result.message ?? undefined, variant: result.status === "FAIL" ? "destructive" : undefined });
    } catch (e) {
      toast({ title: "Health check failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const loadRun = async (id: string) => {
    setLoadingRun(true);
    setSelBank(null);
    setSelQb(null);
    try {
      setDetail(await api<RunDetail>(`/api/accounting/reconciliation/${id}`));
      router.replace(`/accounting/reconciliation?run=${id}`, { scroll: false });
    } catch (e) {
      toast({ title: "Could not load run", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingRun(false);
    }
  };

  const refreshRuns = async () => {
    const r = await api<{ runs: RunRow[] }>("/api/accounting/reconciliation");
    setRuns(r.runs);
  };

  const createRun = async () => {
    setCreating(true);
    try {
      const { id } = await api<{ id: string }>("/api/accounting/reconciliation", {
        method: "POST",
        body: JSON.stringify({
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          qbAccountId: form.qbAccountId || null,
          bankClosingBalance: form.bankClosingBalance.trim() || null,
          dateWindowDays: form.dateWindowDays,
        }),
      });
      await refreshRuns();
      await loadRun(id);
      toast({ title: "Reconciliation complete" });
    } catch (e) {
      await refreshRuns().catch(() => {});
      toast({ title: "Reconciliation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const mutate = async (key: string, url: string, init: RequestInit, done?: string) => {
    if (!detail) return;
    setBusyItem(key);
    try {
      await api(url, init);
      await loadRun(detail.run.id);
      await refreshRuns();
      if (done) toast({ title: done });
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyItem(null);
    }
  };

  const matchSelected = () =>
    detail && selBank && selQb &&
    mutate("match", `/api/accounting/reconciliation/${detail.run.id}/match`, { method: "POST", body: JSON.stringify({ bankItemId: selBank, qbItemId: selQb }) }, "Matched");

  const unmatch = (item: RunItem) =>
    detail && mutate(item.id, `/api/accounting/reconciliation/${detail.run.id}/unmatch`, { method: "POST", body: JSON.stringify({ itemId: item.id }) }, "Un-matched");

  const saveReview = (item: RunItem, reviewed: boolean) =>
    detail &&
    mutate(item.id, `/api/accounting/reconciliation/${detail.run.id}/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ reviewed, reviewNote: noteFor === item.id ? noteText : item.reviewNote }),
    }).then(() => setNoteFor(null));

  const items = useMemo(() => {
    if (!detail) return [];
    const q = search.trim().toLowerCase();
    return detail.items.filter(
      (i) =>
        i.status === tab &&
        (!hideReviewed || !i.reviewed) &&
        (!q || [i.bankDescription, i.qbPayee, i.qbMemo, i.qbDocNumber, i.bankAmount, i.qbAmount, i.reviewNote].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [detail, tab, hideReviewed, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of detail?.items ?? []) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [detail]);

  if (!dbReady) {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-900/20 p-4 text-amber-200 text-sm">
        The reconciliation tables are not in the database yet. Apply the schema (<code>npm run db:push</code>) and reload.
      </div>
    );
  }

  const s = detail?.summary;
  const run = detail?.run;
  const selBankItem = detail?.items.find((i) => i.id === selBank);
  const selQbItem = detail?.items.find((i) => i.id === selQb);

  return (
    <div className="space-y-6">
      <HealthBadge health={health} onCheck={checkHealth} checking={checking} />

      {/* New run */}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-white font-semibold">New reconciliation</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
          <label className="space-y-1">
            <span className="text-gray-400 text-xs">Period start</span>
            <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className="w-full bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-white" />
          </label>
          <label className="space-y-1">
            <span className="text-gray-400 text-xs">Period end</span>
            <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className="w-full bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-white" />
          </label>
          <label className="space-y-1">
            <span className="text-gray-400 text-xs">QuickBooks bank account</span>
            <select value={form.qbAccountId} onChange={(e) => setForm({ ...form, qbAccountId: e.target.value })} className="w-full bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-white">
              {accounts.length === 0 && <option value="">{accountsError ? "QuickBooks unavailable" : "Default (DBS)"}</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-gray-400 text-xs">Statement closing balance (optional)</span>
            <input inputMode="decimal" placeholder="e.g. 125430.55" value={form.bankClosingBalance} onChange={(e) => setForm({ ...form, bankClosingBalance: e.target.value })} className="w-full bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-white font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-gray-400 text-xs">Date window</span>
            <select value={form.dateWindowDays} onChange={(e) => setForm({ ...form, dateWindowDays: Number(e.target.value) })} className="w-full bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-white">
              {[0, 1, 2, 3, 5, 7].map((d) => (
                <option key={d} value={d}>±{d} day{d === 1 ? "" : "s"}</option>
              ))}
            </select>
          </label>
        </div>
        {accountsError && <p className="text-xs text-red-300">QuickBooks accounts could not be loaded: {accountsError}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={createRun} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
            {creating ? "Reconciling..." : "Run reconciliation"}
          </Button>
          {runs.length > 0 && (
            <select value={run?.id ?? ""} onChange={(e) => e.target.value && loadRun(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-sm text-white max-w-full">
              <option value="">Previous runs...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id} disabled={r.status !== "COMPLETED"}>
                  {r.periodStart} to {r.periodEnd} · {r.status === "COMPLETED" ? `${r.matchRate}% matched` : r.status} · {r.trigger === "SCHEDULED" ? "weekly job" : "manual"} · {sgDate(r.createdAt)}
                </option>
              ))}
            </select>
          )}
          {loadingRun && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        {runs[0]?.status === "FAILED" && <p className="text-xs text-red-300">Last run failed: {runs[0].error}</p>}
      </div>

      {!detail && <p className="text-sm text-gray-400">No reconciliation yet. Pick a period and run one.</p>}

      {detail && s && run && (
        <>
          <div>
            <h2 className="text-white font-semibold">
              {run.periodStart} to {run.periodEnd} · {run.qbAccountName ?? "QuickBooks"} vs {run.bankAccountLabel}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Run {sgDate(run.createdAt)} · {run.trigger === "SCHEDULED" ? "weekly job" : "manual"} · date window ±{run.dateWindowDays} days
            </p>
            {run.warnings.length > 0 && <p className="text-xs text-amber-300 mt-1">{run.warnings.join(" · ")}</p>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Match rate" value={`${s.matchRate}%`} sub={`${s.matchedCount + s.mismatchCount} of ${s.bankCount} statement rows`} tone={s.matchRate >= 95 ? "good" : s.matchRate >= 80 ? "warn" : "bad"} />
            <Stat label="Unmatched in bank" value={String(s.unmatchedBankCount)} sub={`in ${money(s.reconciling.bankCreditsNotInQb)} · out ${money(s.reconciling.bankDebitsNotInQb)}`} tone={s.unmatchedBankCount ? "warn" : "good"} />
            <Stat label="Unmatched in QuickBooks" value={String(s.unmatchedQbCount)} sub={`in ${money(s.reconciling.qbCreditsNotInBank)} · out ${money(s.reconciling.qbDebitsNotInBank)}`} tone={s.unmatchedQbCount ? "warn" : "good"} />
            <Stat label="Amount mismatches" value={String(s.mismatchCount)} sub={`net ${money(s.reconciling.amountDifferences)} · ${s.reviewedCount} reviewed`} tone={s.mismatchCount ? "warn" : "good"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">Movement in period</h3>
              <Line label="Statement money in" value={money(s.bankInflow)} />
              <Line label="Statement money out" value={money(s.bankOutflow)} />
              <Line label="Statement net movement" value={money(s.netBankMovement)} strong />
              <Line label="QuickBooks money in" value={money(s.qbInflow)} />
              <Line label="QuickBooks money out" value={money(s.qbOutflow)} />
              <Line label="QuickBooks net movement" value={money(s.netQbMovement)} strong />
              <Line label="Difference (statement − QuickBooks)" value={money(s.movementDifference)} strong />
            </div>
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">Reconciliation as at {run.periodEnd}</h3>
              {s.balances ? (
                <>
                  <Line label="Statement closing balance" value={money(s.balances.bankClosingBalance)} />
                  <Line label="+ QuickBooks deposits not on statement" value={money(s.reconciling.qbCreditsNotInBank)} />
                  <Line label="− QuickBooks payments not on statement" value={money(s.reconciling.qbDebitsNotInBank)} />
                  <Line label="Adjusted statement balance" value={money(s.balances.adjustedBankBalance)} strong />
                  <Line label={`QuickBooks balance${run.qbBalanceBasis === "DERIVED" ? " (derived)" : ""}`} value={money(s.balances.qbClosingBalance)} />
                  <Line label="+ Statement credits not in QuickBooks" value={money(s.reconciling.bankCreditsNotInQb)} />
                  <Line label="− Statement debits not in QuickBooks" value={money(s.reconciling.bankDebitsNotInQb)} />
                  <Line label="± Amount differences" value={money(s.reconciling.amountDifferences)} />
                  <Line label="Adjusted QuickBooks balance" value={money(s.balances.adjustedQbBalance)} strong />
                  <Line label={s.balances.reconciled ? "Reconciled: no unexplained difference" : "Unexplained difference"} value={money(s.balances.unexplainedDifference)} strong />
                </>
              ) : (
                <>
                  <Line label={`QuickBooks balance${run.qbBalanceBasis === "DERIVED" ? " (derived)" : ""}`} value={money(run.qbClosingBalance)} />
                  <Line label="Net reconciling items (expected statement − QuickBooks)" value={money(s.reconciling.totalReconcilingItems)} strong />
                  <p className="text-xs text-gray-500 mt-2">
                    Enter the statement closing balance when you run a reconciliation to see the adjusted balances and any unexplained difference.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.id ? "bg-primary text-on-color" : "bg-gray-900 text-gray-300 hover:bg-gray-800"}`}
                >
                  {t.label} <span className="opacity-70">({counts[t.id] ?? 0})</span>
                </button>
              ))}
              <div className="flex-1" />
              <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5 text-sm text-white w-40" />
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                <input type="checkbox" checked={hideReviewed} onChange={(e) => setHideReviewed(e.target.checked)} /> Hide reviewed
              </label>
            </div>

            {(selBank || selQb) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-800 bg-blue-900/20 px-3 py-2 text-sm text-blue-100">
                <span>
                  Manual match: bank {selBankItem ? `${selBankItem.bankDate} ${money(selBankItem.bankAmount)}` : "(pick in Unmatched in bank)"} ↔ QuickBooks{" "}
                  {selQbItem ? `${selQbItem.qbDate} ${money(selQbItem.qbAmount)}` : "(pick in Unmatched in QuickBooks)"}
                </span>
                <Button size="sm" onClick={matchSelected} disabled={!selBank || !selQb || busyItem === "match"}>
                  <Link2 className="h-3.5 w-3.5 mr-1.5" /> Match selected
                </Button>
                <button className="text-xs underline opacity-80" onClick={() => { setSelBank(null); setSelQb(null); }}>Clear</button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                    {(tab === "UNMATCHED_BANK" || tab === "UNMATCHED_QB") && <th className="py-2 pr-2 w-8" />}
                    {tab !== "UNMATCHED_QB" && <th className="py-2 pr-3">Statement</th>}
                    {tab !== "UNMATCHED_BANK" && <th className="py-2 pr-3">QuickBooks</th>}
                    <th className="py-2 pr-3 text-right">Amount</th>
                    {(tab === "MATCHED" || tab === "AMOUNT_MISMATCH") && <th className="py-2 pr-3">Match</th>}
                    <th className="py-2 pr-3">Review</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-500">Nothing here.</td>
                    </tr>
                  )}
                  {items.map((i) => {
                    const dir = (i.bankDirection ?? i.qbDirection) === "CREDIT";
                    const selected = i.id === selBank || i.id === selQb;
                    return (
                      <tr key={i.id} className={`border-b border-gray-900 align-top ${selected ? "bg-blue-900/20" : ""} ${i.reviewed ? "opacity-70" : ""}`}>
                        {(tab === "UNMATCHED_BANK" || tab === "UNMATCHED_QB") && (
                          <td className="py-2 pr-2">
                            <input
                              type="radio"
                              aria-label="Select for manual match"
                              checked={selected}
                              onChange={() => (tab === "UNMATCHED_BANK" ? setSelBank(i.id) : setSelQb(i.id))}
                            />
                          </td>
                        )}
                        {tab !== "UNMATCHED_QB" && (
                          <td className="py-2 pr-3 max-w-md">
                            <p className="text-gray-300 font-mono text-xs">{i.bankDate}</p>
                            <p className="text-gray-200 break-words">{i.bankDescription}</p>
                          </td>
                        )}
                        {tab !== "UNMATCHED_BANK" && (
                          <td className="py-2 pr-3 max-w-sm">
                            <p className="text-gray-300 font-mono text-xs">
                              {i.qbDate} · {i.qbTxnType} #{i.qbDocNumber || i.qbTxnId}
                            </p>
                            <p className="text-gray-200 break-words">{[i.qbPayee, i.qbMemo].filter(Boolean).join(" · ") || "—"}</p>
                          </td>
                        )}
                        <td className={`py-2 pr-3 text-right font-mono whitespace-nowrap ${dir ? "text-emerald-300" : "text-red-300"}`}>
                          {dir ? "+" : "−"}{money(i.bankAmount ?? i.qbAmount)}
                          {i.status === "AMOUNT_MISMATCH" && (
                            <p className="text-xs text-amber-300">QB {money(i.qbAmount)} · diff {money(i.amountDifference)}</p>
                          )}
                        </td>
                        {(tab === "MATCHED" || tab === "AMOUNT_MISMATCH") && (
                          <td className="py-2 pr-3 text-xs text-gray-400 whitespace-nowrap">
                            {i.matchMethod}
                            {i.confidence !== null ? ` · ${i.confidence}%` : ""}
                            {i.dayDifference ? ` · ${i.dayDifference > 0 ? "+" : ""}${i.dayDifference}d` : ""}
                          </td>
                        )}
                        <td className="py-2 pr-3 text-xs max-w-xs">
                          {noteFor === i.id ? (
                            <div className="space-y-1.5">
                              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white" placeholder="Note (optional)" />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveReview(i, true)} disabled={busyItem === i.id}>Mark reviewed</Button>
                                {i.reviewed && <Button size="sm" variant="outline" onClick={() => saveReview(i, false)} disabled={busyItem === i.id}>Unmark</Button>}
                                <button className="underline text-gray-400" onClick={() => setNoteFor(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {i.reviewed ? <span className="text-green-300">Reviewed</span> : <span className="text-gray-500">Open</span>}
                              {i.wasUnmatched && <span className="text-gray-500"> · manually un-matched</span>}
                              {i.reviewNote && <p className="text-gray-300 mt-0.5 break-words">{i.reviewNote}</p>}
                            </>
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {busyItem === i.id ? (
                            <Loader2 className="h-4 w-4 animate-spin inline text-gray-400" />
                          ) : (
                            <div className="inline-flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => { setNoteFor(i.id); setNoteText(i.reviewNote ?? ""); }} title="Review / note">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Button>
                              {(i.status === "MATCHED" || i.status === "AMOUNT_MISMATCH") && (
                                <Button size="sm" variant="outline" onClick={() => unmatch(i)} title="Un-match">
                                  <Unlink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
