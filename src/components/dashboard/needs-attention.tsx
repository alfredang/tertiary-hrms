import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronRight } from "lucide-react";
import type { Finding, Severity } from "@/lib/hr-compliance";
import type { PendingApprovals } from "@/lib/hr-insights";

const CATEGORY_LABEL: Record<Finding["category"], string> = {
  AL_EXCESS: "Annual leave over entitlement",
  MC_EXCESS: "MC above entitlement",
  MC_PATTERN: "MC patterns to review",
  NPL: "No Pay Leave near / over cap",
  ATTENDANCE: "Intern missed clock-in / out",
};

// Status colours are reserved for state and always ship with an icon + label.
const SEV: Record<Severity, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  high: { icon: AlertTriangle, cls: "text-red-400", label: "High" },
  medium: { icon: AlertCircle, cls: "text-amber-400", label: "Medium" },
  low: { icon: Info, cls: "text-sky-400", label: "Low" },
};
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** One line per alert category (worst severity, how many people) — the detail lives on /dashboard/insights. */
export function NeedsAttention({ findings, pending }: { findings: Finding[]; pending: PendingApprovals }) {
  const groups = new Map<Finding["category"], { worst: Severity; people: Set<string>; names: string[] }>();
  for (const f of findings) {
    const g = groups.get(f.category) ?? { worst: f.severity, people: new Set<string>(), names: [] };
    if (RANK[f.severity] < RANK[g.worst]) g.worst = f.severity;
    if (!g.people.has(f.employeeId)) {
      g.people.add(f.employeeId);
      g.names.push(f.name.split(" ")[0]);
    }
    groups.set(f.category, g);
  }
  const rows = Array.from(groups.entries()).sort((a, b) => RANK[a[1].worst] - RANK[b[1].worst] || b[1].people.size - a[1].people.size);
  const approvals = [
    { label: "Leave", value: pending.leave, href: "/leave/annual" },
    { label: "MC", value: pending.mc, href: "/leave/medical" },
    { label: "Time off", value: pending.timeOff, href: "/time-off" },
    { label: "Missing punches", value: pending.corrections, href: "/timesheet/overview" },
    { label: "Claims", value: pending.expenses, href: "/expenses" },
  ].filter((a) => a.value > 0);

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Needs attention</h2>
        <Link href="/dashboard/insights#alerts" className="text-xs text-primary hover:underline">All details</Link>
      </div>

      {approvals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {approvals.map((a) => (
            <Link key={a.label} href={a.href} className="inline-flex items-center gap-1.5 rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300 hover:border-primary/60">
              <span className="font-semibold tabular-nums text-white">{a.value}</span> {a.label} to approve
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-400"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> No compliance alerts.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-800/80">
          {rows.map(([cat, g]) => {
            const s = SEV[g.worst];
            return (
              <li key={cat}>
                <Link href={`/dashboard/insights?cat=${cat}#alerts`} className="group flex items-center gap-3 py-2.5">
                  <s.icon className={`h-4 w-4 shrink-0 ${s.cls}`} aria-label={s.label} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-200">{CATEGORY_LABEL[cat]}</span>
                    <span className="block truncate text-xs text-gray-500">{g.names.slice(0, 4).join(", ")}{g.names.length > 4 ? ` +${g.names.length - 4}` : ""}</span>
                  </span>
                  <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs tabular-nums text-gray-300">{g.people.size} {g.people.size === 1 ? "person" : "people"}</span>
                  <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-primary" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
