import { Fragment } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, CalendarDays, Clock, Stethoscope, Wallet } from "lucide-react";
import type { Finding } from "@/lib/hr-compliance";
import type { InternHoursRow, LeaveCategory, PendingApprovals, PersonOverviewRow } from "@/lib/hr-insights";

interface Props {
  people: PersonOverviewRow[];
  interns: InternHoursRow[];
  pending: PendingApprovals;
  findings: Finding[];
  monthLabel: string;
  year: number;
  /** Shown in the alerts heading when the list is filtered to one category. */
  focusLabel?: string;
}

const CATS: Array<{ key: LeaveCategory; label: string }> = [
  { key: "MC", label: "MC" },
  { key: "LEAVE", label: "Leave" },
  { key: "NPL", label: "No Pay Leave" },
];

const SEV_STYLE: Record<Finding["severity"], string> = {
  high: "border-red-800/60 bg-red-950/30 text-red-300",
  medium: "border-amber-800/60 bg-amber-950/20 text-amber-300",
  low: "border-blue-800/60 bg-blue-950/20 text-blue-300",
};

function n(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function sumBy(rows: PersonOverviewRow[], period: "year" | "month", cat: LeaveCategory) {
  return rows.reduce((s, r) => s + r.taken[period][cat], 0);
}

function Section({ id, title, icon: Icon, children, right }: { id?: string; title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-gray-800 bg-gray-950 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-white font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function AdminHrOverview({ people, interns, pending, findings, monthLabel, year, focusLabel }: Props) {
  const staff = people.filter((p) => !p.isIntern);
  const internPeople = people.filter((p) => p.isIntern);
  const totalPending = pending.leave + pending.mc + pending.timeOff + pending.corrections + pending.expenses;
  const missingOutCount = interns.reduce((s, i) => s + i.missingClockOuts.length, 0);

  const pendingItems = [
    { label: "Leave", value: pending.leave, href: "/leave/annual" },
    { label: "MC", value: pending.mc, href: "/leave/medical" },
    { label: "Time off", value: pending.timeOff, href: "/time-off" },
    { label: "Missing punches", value: pending.corrections, href: "/attendance/overview" },
    { label: "Expense claims", value: pending.expenses, href: "/expenses" },
  ];

  return (
    <div className="space-y-6">
      {/* Alerts for the admins */}
      <Section
        id="alerts"
        title={focusLabel ? `Alerts — ${focusLabel}` : "Admin alerts"}
        icon={BellRing}
        right={<span className="text-xs text-gray-500">Emailed to Alfred Ang &amp; Tan Soik Ching by the HR cron jobs</span>}
      >
        <div id="approvals" className="scroll-mt-24 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {pendingItems.map((p) => (
            <Link key={p.label} href={p.href} className={`rounded-lg border px-3 py-2 hover:bg-gray-900 ${p.value > 0 ? "border-amber-800/60" : "border-gray-800"}`}>
              <p className="text-xs text-gray-400">Pending {p.label.toLowerCase()}</p>
              <p className={`text-xl font-bold ${p.value > 0 ? "text-amber-400" : "text-gray-500"}`}>{p.value}</p>
            </Link>
          ))}
        </div>
        {missingOutCount > 0 && (
          <p className="flex items-center gap-2 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4" />
            {missingOutCount} intern missing clock-out(s) in the last 14 days without a correction.
          </p>
        )}
        {findings.length === 0 && totalPending === 0 ? (
          <p className="text-sm text-gray-500">No alerts.</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f, i) => (
              <li key={`${f.employeeId}-${f.category}-${i}`} className={`rounded-lg border px-3 py-2 text-sm ${SEV_STYLE[f.severity]}`}>
                <span className="font-semibold">{f.name}</span>
                <span className="text-gray-500"> ({f.employeeCode})</span> — {f.message}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* MC / Leave / NPL taken — staff vs interns */}
      <Section id="leave" title={`MC, leave and No Pay Leave taken — ${year}`} icon={Stethoscope}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-3">Approved days</th>
                {CATS.map((c) => (
                  <th key={c.key} className="py-2 pr-3 text-right" colSpan={2}>{c.label}</th>
                ))}
              </tr>
              <tr className="text-right text-[11px] text-gray-600 border-b border-gray-800">
                <th />
                {CATS.map((c) => (
                  <Fragment key={c.key}>
                    <th key={`${c.key}-y`} className="py-1 pr-3">This year</th>
                    <th key={`${c.key}-m`} className="py-1 pr-3">{monthLabel}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-200">
              {[{ label: `Staff (${staff.length})`, rows: staff }, { label: `Interns (${internPeople.length})`, rows: internPeople }].map((g) => (
                <tr key={g.label}>
                  <td className="py-2 pr-3">{g.label}</td>
                  {CATS.map((c) => (
                    <Fragment key={c.key}>
                      <td key={`${c.key}-y`} className="py-2 pr-3 text-right font-mono">{n(sumBy(g.rows, "year", c.key))}</td>
                      <td key={`${c.key}-m`} className="py-2 pr-3 text-right font-mono text-gray-400">{n(sumBy(g.rows, "month", c.key))}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">Days are counted in the month the leave starts. Interns&apos; sick leave is recorded as No Pay Leave.</p>
      </Section>

      {/* Per person */}
      <Section title="Per person" icon={CalendarDays}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3 text-right">AL taken / available</th>
                <th className="py-2 pr-3 text-right">MC taken / earned</th>
                <th className="py-2 pr-3 text-right">NPL taken + pending / cap</th>
                <th className="py-2 pr-3 text-right">{monthLabel}: MC · Leave · NPL</th>
                <th className="py-2 text-right">Pending days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-200">
              {people.map((p) => {
                const alAvail = p.al.allowed + p.al.carried;
                const alOver = p.al.used + p.al.pending > alAvail;
                const mcOver = p.isIntern ? p.mc.used + p.mc.pending > 0 : p.mc.used + p.mc.pending > p.mc.earned;
                const npl = p.npl.used + p.npl.pending;
                const nplOver = npl > p.npl.cap;
                const nplNear = !nplOver && p.npl.cap > 0 && npl >= p.npl.cap * 0.8;
                return (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.name} <span className="text-gray-500">({p.employeeCode})</span>
                      {p.isIntern && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300">Intern</span>}
                    </td>
                    <td className={`py-2 pr-3 text-right font-mono ${alOver ? "text-red-400" : ""}`}>{n(p.al.used)} / {n(alAvail)}</td>
                    <td className={`py-2 pr-3 text-right font-mono ${mcOver ? "text-red-400" : ""}`}>{p.isIntern ? `${n(p.mc.used)} (unpaid)` : `${n(p.mc.used)} / ${n(p.mc.earned)}`}</td>
                    <td className={`py-2 pr-3 text-right font-mono ${nplOver ? "text-red-400" : nplNear ? "text-amber-400" : ""}`}>
                      {n(p.npl.used)}{p.npl.pending > 0 ? ` + ${n(p.npl.pending)}` : ""} / {n(p.npl.cap)}
                      {p.nplSickDays > 0 && <span className="text-gray-500"> ({n(p.nplSickDays)} sick)</span>}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-400">{n(p.taken.month.MC)} · {n(p.taken.month.LEAVE)} · {n(p.taken.month.NPL)}</td>
                    <td className={`py-2 text-right font-mono ${p.pendingDays > 0 ? "text-amber-400" : "text-gray-500"}`}>{n(p.pendingDays)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">
          Available AL and earned MC are prorated by completed months served this year; the No Pay Leave cap is 21 days a year, prorated the same way.
        </p>
      </Section>

      {/* Intern hours */}
      <Section
        id="interns"
        title="Intern hours"
        icon={Clock}
        right={<Link href="/attendance/overview" className="text-xs text-primary hover:underline">Attendance details</Link>}
      >
        {interns.length === 0 ? (
          <p className="text-sm text-gray-500">No active interns.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="py-2 pr-3">Intern</th>
                  <th className="py-2 pr-3 text-right">This week</th>
                  <th className="py-2 pr-3 text-right">{monthLabel}</th>
                  <th className="py-2 pr-3 text-right">Days worked</th>
                  <th className="py-2 pr-3">Missing clock-outs (14 days)</th>
                  <th className="py-2 pr-3">Missing clock-ins</th>
                  <th className="py-2 text-right">Corrections pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-200">
                {interns.map((i) => (
                  <tr key={i.id} className={i.missingClockOuts.length > 0 ? "bg-red-950/20" : ""}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {i.name} <span className="text-gray-500">({i.employeeCode})</span>
                      {i.clockedInNow && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-green-950/60 border border-green-800 text-green-300">Clocked in</span>}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{i.weekHours.toFixed(1)} h</td>
                    <td className="py-2 pr-3 text-right font-mono">{i.monthHours.toFixed(1)} h</td>
                    <td className="py-2 pr-3 text-right font-mono">{i.daysWorkedMonth}</td>
                    <td className={`py-2 pr-3 ${i.missingClockOuts.length ? "text-red-400 font-medium" : "text-gray-600"}`}>
                      {i.missingClockOuts.length ? i.missingClockOuts.join(", ") : "—"}
                    </td>
                    <td className={`py-2 pr-3 ${i.missingClockIns.length ? "text-amber-400" : "text-gray-600"}`}>
                      {i.missingClockIns.length ? i.missingClockIns.join(", ") : "—"}
                    </td>
                    <td className={`py-2 text-right font-mono ${i.pendingCorrections ? "text-amber-400" : "text-gray-600"}`}>{i.pendingCorrections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-600 flex items-center gap-1"><Wallet className="h-3 w-3" /> Hours count completed punches only. Today is excluded from missing punches.</p>
      </Section>
    </div>
  );
}
