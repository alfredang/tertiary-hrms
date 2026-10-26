"use client";

import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Briefcase, Calendar, ChevronRight } from "lucide-react";

interface OtLog {
  id: string;
  date: string;
  type: string;
  note: string | null;
  daysEarned: number;
  recordedBy: string | null;
  createdAt: string;
}

interface OtStats {
  earned: number;
  used: number;
  autoDeducted: number;
  pending: number;
  remaining: number;
}

/** A leave request that drew on (or is holding) Off In Lieu days. */
export interface OtUsageEntry {
  id: string;
  startDate: string;
  endDate: string;
  status: "APPROVED" | "PENDING";
  leaveTypeName: string;
  /** Off In Lieu days this request takes. */
  oilDays: number;
  /** Days beyond all balances, recorded as Off In Lieu deficit. */
  deficitDays: number;
}

type Tab = "earned" | "used";

const TYPE_LABELS: Record<string, string> = {
  WEEKEND: "Weekend",
  PUBLIC_HOLIDAY: "Public Holiday",
  OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  WEEKEND: "text-blue-400 bg-blue-950/30 border-blue-800/40",
  PUBLIC_HOLIDAY: "text-amber-400 bg-amber-950/30 border-amber-800/40",
  OTHER: "text-gray-400 bg-gray-900 border-gray-800",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRange(start: string, end: string) {
  const s = formatDate(start);
  const e = formatDate(end);
  return s === e ? s : `${s} – ${e}`;
}

function plural(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

interface Props {
  otStats: OtStats;
  employeeId?: string;
  usage: OtUsageEntry[];
}

export function OtBalancePanel({ otStats, employeeId, usage }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("earned");
  const [logs, setLogs] = useState<OtLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = employeeId ? `/api/ot-log?employeeId=${employeeId}` : "/api/ot-log";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [open, employeeId]);

  const openTab = (t: Tab) => {
    setTab(t);
    setOpen(true);
  };

  const inDeficit = otStats.remaining < 0;
  const approvedUsage = usage.filter((u) => u.status === "APPROVED");
  const pendingUsage = usage.filter((u) => u.status === "PENDING");
  // Balance "used" can include manual HR adjustments that no leave request explains.
  const listedUsed = approvedUsage.reduce((s, u) => s + u.oilDays, 0);
  const adjustment = Math.round((otStats.used - listedUsed) * 100) / 100;

  return (
    <div className={`bg-gray-950 border rounded-xl p-4 ${inDeficit ? "border-red-800/50" : "border-emerald-800/40"}`}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className={`h-2 w-2 rounded-full ${inDeficit ? "bg-red-400" : "bg-emerald-400"}`} />
        <h3 className={`text-sm font-semibold ${inDeficit ? "text-red-400" : "text-emerald-400"}`}>
          Off In Lieu Balance
        </h3>
        <span className="text-xs text-gray-500">Earned from weekend / public holiday work</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)] gap-3">
        {/* Remaining — the number people actually care about */}
        <button
          onClick={() => openTab("earned")}
          className={`text-left rounded-lg p-4 border transition-colors ${
            inDeficit
              ? "bg-red-950/30 border-red-800/50 hover:border-red-700"
              : "bg-emerald-950/30 border-emerald-800/50 hover:border-emerald-700"
          }`}
        >
          <p className={`text-xs font-medium uppercase tracking-wide ${inDeficit ? "text-red-300" : "text-emerald-300"}`}>
            {inDeficit ? "Deficit owed" : "Available to use"}
          </p>
          <p className={`mt-1 text-4xl font-bold ${inDeficit ? "text-red-400" : "text-emerald-400"}`}>
            {Math.abs(otStats.remaining)}
            <span className="ml-1.5 text-base font-medium text-gray-400">
              {Math.abs(otStats.remaining) === 1 ? "day" : "days"}
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {otStats.earned} earned − {otStats.used} used
            {otStats.pending > 0 && ` − ${otStats.pending} pending`}
            {otStats.autoDeducted > 0 && ` − ${otStats.autoDeducted} deficit`}
          </p>
        </button>

        {/* Supporting figures — each opens its breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatButton label="Earned" value={otStats.earned} color="text-gray-200" hint="Days worked" onClick={() => openTab("earned")} />
          <StatButton
            label="Used"
            value={otStats.used}
            color="text-amber-400"
            hint={otStats.pending > 0 ? `+${otStats.pending} pending` : "Leave taken"}
            onClick={() => openTab("used")}
          />
          <StatButton label="Deficit" value={otStats.autoDeducted} color={otStats.autoDeducted > 0 ? "text-red-400" : "text-gray-500"} hint="Owed back" onClick={() => openTab("used")} />
        </div>
      </div>

      {inDeficit && (
        <p className="text-xs text-gray-500 mt-2">
          Work on weekends or public holidays to earn Off In Lieu days and reduce this deficit.
        </p>
      )}

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[calc(100%-2rem)] max-w-lg max-h-[85vh] overflow-y-auto bg-gray-950 border border-gray-800 rounded-xl p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <DialogPrimitive.Title className="text-base font-semibold text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                Off In Lieu Breakdown
                <span className="text-xs font-normal text-gray-400">({new Date().getFullYear()})</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="text-gray-400 hover:text-white transition-colors rounded-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            {/* Remaining first, then the figures behind it */}
            <div className={`rounded-lg p-3 mb-4 border ${inDeficit ? "bg-red-950/30 border-red-800/50" : "bg-emerald-950/30 border-emerald-800/50"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-xs font-medium uppercase tracking-wide ${inDeficit ? "text-red-300" : "text-emerald-300"}`}>
                  {inDeficit ? "Deficit owed" : "Available to use"}
                </p>
                <p className={`text-2xl font-bold ${inDeficit ? "text-red-400" : "text-emerald-400"}`}>
                  {plural(Math.abs(otStats.remaining))}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs border-t border-white/5 pt-2">
                <div>
                  <p className="text-gray-400">Earned</p>
                  <p className="text-gray-200 font-semibold">{otStats.earned}</p>
                </div>
                <div>
                  <p className="text-gray-400">Used</p>
                  <p className="text-amber-400 font-semibold">{otStats.used}</p>
                </div>
                <div>
                  <p className="text-gray-400">Deficit</p>
                  <p className={`font-semibold ${otStats.autoDeducted > 0 ? "text-red-400" : "text-gray-500"}`}>{otStats.autoDeducted}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-3 p-1 rounded-lg bg-gray-900 border border-gray-800">
              <TabButton active={tab === "earned"} onClick={() => setTab("earned")}>
                Days earned <span className="text-gray-500">({otStats.earned})</span>
              </TabButton>
              <TabButton active={tab === "used"} onClick={() => setTab("used")}>
                Days used <span className="text-gray-500">({otStats.used + otStats.pending})</span>
              </TabButton>
            </div>

            {tab === "earned" ? (
              loading ? (
                <div className="flex items-center justify-center py-10 text-gray-500 text-sm">Loading...</div>
              ) : logs.length === 0 ? (
                <EmptyState
                  title="No Off In Lieu days earned yet"
                  body="Off In Lieu days are credited when admin approves your weekend or public holiday work."
                />
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <Row
                      key={log.id}
                      title={formatDate(log.date)}
                      badge={
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_COLORS[log.type] ?? TYPE_COLORS.OTHER}`}>
                          {TYPE_LABELS[log.type] ?? log.type}
                        </span>
                      }
                      sub={log.note}
                      amount={<span className="text-emerald-400">+{log.daysEarned}d</span>}
                    />
                  ))}
                </div>
              )
            ) : usage.length === 0 && adjustment === 0 ? (
              <EmptyState
                title="No Off In Lieu days used yet"
                body="When you take leave using your Off In Lieu balance, the dates will show here."
              />
            ) : (
              <div className="space-y-2">
                {pendingUsage.map((u) => (
                  <UsageRow key={u.id} entry={u} />
                ))}
                {approvedUsage.map((u) => (
                  <UsageRow key={u.id} entry={u} />
                ))}
                {adjustment !== 0 && (
                  <Row
                    title="Balance adjustment"
                    sub="Set by HR — not linked to a leave request"
                    amount={<span className="text-amber-400">{adjustment > 0 ? "−" : "+"}{Math.abs(adjustment)}d</span>}
                  />
                )}
              </div>
            )}

            {inDeficit && (
              <div className="mt-3 bg-red-950/20 border border-red-800/40 rounded-lg p-2.5 text-xs text-red-300">
                You have a deficit of {plural(Math.abs(otStats.remaining))}. Work on weekends or public holidays and get admin approval to earn Off In Lieu days and reduce this.
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function StatButton({ label, value, color, hint, onClick }: { label: string; value: number; color: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-gray-900 rounded-lg p-3 border border-transparent hover:border-gray-700 transition-colors"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{label}</p>
        <ChevronRight className="h-3.5 w-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
      </div>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ title, badge, sub, amount }: { title: string; badge?: React.ReactNode; sub?: string | null; amount: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white">{title}</span>
          {badge}
        </div>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="text-right shrink-0 text-sm font-bold">{amount}</div>
    </div>
  );
}

function UsageRow({ entry }: { entry: OtUsageEntry }) {
  const pending = entry.status === "PENDING";
  const parts = [entry.leaveTypeName];
  if (entry.deficitDays > 0) parts.push(`${entry.deficitDays}d recorded as deficit`);
  return (
    <Row
      title={formatRange(entry.startDate, entry.endDate)}
      badge={
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            pending ? "text-amber-300 bg-amber-950/30 border-amber-800/40" : "text-gray-300 bg-gray-800/60 border-gray-700"
          }`}
        >
          {pending ? "Pending" : "Approved"}
        </span>
      }
      sub={parts.join(" · ")}
      amount={
        entry.oilDays > 0 ? (
          <span className={pending ? "text-gray-400" : "text-amber-400"}>−{entry.oilDays}d</span>
        ) : (
          <span className="text-red-400">−{entry.deficitDays}d</span>
        )
      }
    />
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-gray-600">
      <Calendar className="h-8 w-8 opacity-30" />
      <p className="text-sm">{title}</p>
      <p className="text-xs text-center text-gray-700 max-w-xs">{body}</p>
    </div>
  );
}
