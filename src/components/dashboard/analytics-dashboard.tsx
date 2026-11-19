"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { AnalyticsData } from "@/lib/analytics";
import type { LeaveCategory } from "@/lib/hr-insights";
import { cn } from "@/lib/utils";
import { BarChart, type BarDatum, type BarSeries } from "@/components/dashboard/bar-chart";

// Categorical slots validated with the dataviz validator on the light (#FFFFFF) and dark (#030712) cards.
// Colour follows the entity: Leave / MC / No Pay Leave match the dashboard chart.
const BLUE = "#5B82F0", TEAL = "#22978B", AMBER = "#BF8420";
const FINANCE: BarSeries[] = [
  { key: "revenue", label: "Revenue", color: BLUE },
  { key: "expenses", label: "Expenses", color: AMBER },
];
const LEAVE: (BarSeries & { key: LeaveCategory })[] = [
  { key: "LEAVE", label: "Leave", color: BLUE },
  { key: "MC", label: "MC", color: TEAL },
  { key: "NPL", label: "No Pay Leave", color: AMBER },
];
const HEADCOUNT: BarSeries[] = [
  { key: "staff", label: "Staff", color: BLUE },
  { key: "interns", label: "Interns", color: TEAL },
];

type Who = "all" | "staff" | "interns";
const PERIODS = [3, 6, 12] as const;

const days = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const money = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(v);
const moneyAxis = (v: number) => (v >= 1_000_000 ? `$${+(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${+(v / 1000).toFixed(0)}k` : `$${v}`);

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(12);
  const [who, setWho] = useState<Who>("all");
  const [person, setPerson] = useState("");
  const [leaveOff, setLeaveOff] = useState<LeaveCategory[]>([]);
  const [typeOff, setTypeOff] = useState<string[]>([]);

  const months = useMemo(() => data.months.slice(-period), [data.months, period]);
  const monthSet = useMemo(() => new Set(months.map((m) => m.key)), [months]);
  const title = (key: string) => {
    const m = data.months.find((x) => x.key === key);
    return m ? `${m.label} ${m.year}` : key;
  };
  const rangeLabel = months.length ? `${title(months[0].key)} to ${title(months[months.length - 1].key)}` : "";

  // ── People slicer ────────────────────────────────────────────────────────
  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const inWho = (intern: boolean) => who === "all" || (who === "interns") === intern;
  const selectable = data.people.filter((p) => inWho(p.intern));
  const activePerson = person && selectable.some((p) => p.id === person) ? person : "";

  // ── Leave ────────────────────────────────────────────────────────────────
  const leaveSeries = LEAVE.filter((s) => !leaveOff.includes(s.key));
  const leaveRows = useMemo(
    () =>
      data.leave.filter((r) => {
        const p = peopleById.get(r.personId);
        if (!p || !monthSet.has(r.month) || leaveOff.includes(r.category)) return false;
        if (activePerson) return r.personId === activePerson;
        return who === "all" || (who === "interns") === p.intern;
      }),
    [data.leave, peopleById, monthSet, leaveOff, activePerson, who],
  );
  const leaveByMonth: BarDatum[] = months.map((m) => {
    const values: Record<string, number> = { LEAVE: 0, MC: 0, NPL: 0 };
    for (const r of leaveRows) if (r.month === m.key) values[r.category] += r.days;
    return { label: m.label, title: title(m.key), values };
  });
  const leaveTotal = (k: LeaveCategory) => leaveRows.reduce((t, r) => t + (r.category === k ? r.days : 0), 0);
  const byPerson = useMemo(() => {
    const map = new Map<string, Record<LeaveCategory, number>>();
    for (const r of leaveRows) {
      const row = map.get(r.personId) ?? { LEAVE: 0, MC: 0, NPL: 0 };
      row[r.category] += r.days;
      map.set(r.personId, row);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, person: peopleById.get(id)!, v, total: v.LEAVE + v.MC + v.NPL }))
      .sort((a, b) => b.total - a.total || a.person.name.localeCompare(b.person.name));
  }, [leaveRows, peopleById]);

  // ── Finance ──────────────────────────────────────────────────────────────
  const financeRows = useMemo(() => (data.finance ?? []).filter((r) => monthSet.has(r.month)), [data.finance, monthSet]);
  const types = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number }>();
    for (const r of financeRows) {
      const t = map.get(r.type) ?? { revenue: 0, expenses: 0 };
      t.revenue += r.revenue;
      t.expenses += r.expenses;
      map.set(r.type, t);
    }
    return Array.from(map.entries()).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.expenses + b.revenue - (a.expenses + a.revenue));
  }, [financeRows]);
  const financeOn = financeRows.filter((r) => !typeOff.includes(r.type));
  const financeByMonth: BarDatum[] = months.map((m) => {
    const values = { revenue: 0, expenses: 0 };
    for (const r of financeOn) if (r.month === m.key) { values.revenue += r.revenue; values.expenses += r.expenses; }
    return { label: m.label, title: title(m.key), values };
  });
  const revenue = financeOn.reduce((t, r) => t + r.revenue, 0);
  const expenses = financeOn.reduce((t, r) => t + r.expenses, 0);
  const typeMax = Math.max(1, ...types.map((t) => Math.max(t.revenue, t.expenses)));

  // ── Headcount ────────────────────────────────────────────────────────────
  const headSeries = HEADCOUNT.filter((s) => who === "all" || s.key === who);
  const headByMonth: BarDatum[] = data.headcount.filter((h) => monthSet.has(h.month)).map((h) => ({
    label: data.months.find((m) => m.key === h.month)?.label ?? h.month,
    title: title(h.month),
    values: { staff: who === "interns" ? 0 : h.staff, interns: who === "staff" ? 0 : h.interns },
  }));
  const headNow = headByMonth[headByMonth.length - 1]?.values ?? { staff: 0, interns: 0 };
  const headFirst = headByMonth[0]?.values ?? { staff: 0, interns: 0 };
  const headTotal = (v: Record<string, number>) => (v.staff ?? 0) + (v.interns ?? 0);
  const headDelta = headTotal(headNow) - headTotal(headFirst);

  const filtered = period !== 12 || who !== "all" || !!activePerson || leaveOff.length > 0 || typeOff.length > 0;
  const reset = () => { setPeriod(12); setWho("all"); setPerson(""); setLeaveOff([]); setTypeOff([]); };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const selectedName = activePerson ? peopleById.get(activePerson)?.name : undefined;

  return (
    <div className="space-y-5">
      {/* Filters: one row above every chart */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-800 bg-gray-950 px-3 py-2.5">
        <Segmented label="Period" value={String(period)} onChange={(v) => setPeriod(Number(v) as (typeof PERIODS)[number])}
          options={PERIODS.map((p) => ({ value: String(p), label: `${p} months` }))} />
        <Segmented label="Who" value={who} onChange={(v) => { setWho(v as Who); setPerson(""); }}
          options={[{ value: "all", label: "All" }, { value: "staff", label: "Staff" }, { value: "interns", label: "Interns" }]} />
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="sr-only sm:not-sr-only">Person</span>
          <select value={activePerson} onChange={(e) => setPerson(e.target.value)} aria-label="Person"
            className="max-w-[14rem] rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white">
            <option value="">Everyone</option>
            {selectable.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (left)"}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Leave type">
          {LEAVE.map((s) => {
            const on = !leaveOff.includes(s.key);
            return (
              <button key={s.key} type="button" aria-pressed={on} onClick={() => setLeaveOff(toggle(leaveOff, s.key))}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-gray-700 text-white" : "border-gray-800 text-gray-500 line-through")}>
                <span className="h-2 w-2 rounded-sm" style={{ background: on ? s.color : "rgb(var(--hrms-gray-600))" }} aria-hidden />{s.label}
              </button>
            );
          })}
        </div>
        {filtered && (
          <button type="button" onClick={reset} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:text-white">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      {/* Summary tiles: same filtered rows as the charts below */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {data.finance && <Tile label="Revenue" value={money(revenue)} sub={rangeLabel} href="#finance" />}
        {data.finance && <Tile label="Expenses" value={money(expenses)} sub={typeOff.length ? `${typeOff.length} categor${typeOff.length === 1 ? "y" : "ies"} hidden` : "all categories"} href="#finance" />}
        {data.finance && <Tile label="Net" value={money(revenue - expenses)} sub="revenue less expenses" href="#finance" />}
        <Tile label="Leave" value={`${days(leaveTotal("LEAVE"))} d`} sub={selectedName ?? (who === "all" ? "staff and interns" : who)} href="#leave" />
        <Tile label="MC" value={`${days(leaveTotal("MC"))} d`} sub={`${byPerson.filter((p) => p.v.MC > 0).length} people`} href="#leave" />
        <Tile label="Headcount" value={String(headTotal(headNow))} sub={`${headDelta >= 0 ? "+" : ""}${headDelta} over ${months.length} months`} href="#headcount" />
      </div>

      {data.finance && (
        <Card id="finance" title="Revenue and expenses" sub={`Bank transactions by payment month${data.financeRange ? ` · imported data runs ${data.financeRange.from} to ${data.financeRange.to}` : ""}`}
          legend={FINANCE.map((s) => ({ ...s, total: money(s.key === "revenue" ? revenue : expenses) }))}
          table={{
            head: ["Month", "Revenue", "Expenses", "Net"],
            rows: financeByMonth.map((d) => [d.title ?? d.label, money(d.values.revenue), money(d.values.expenses), money(d.values.revenue - d.values.expenses)]),
          }}>
          {financeRows.length === 0 ? <Empty>No bank transactions in this period.</Empty> : (
            <div className="grid gap-5 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <BarChart data={financeByMonth} series={FINANCE} mode="grouped" format={money} axisFormat={moneyAxis} ariaLabel="Revenue and expenses by month"
                  footer={(d) => ({ label: "Net", value: money(d.values.revenue - d.values.expenses) })} />
              </div>
              {/* Category slicer: click a row to leave it out of the chart and the tiles */}
              <div className="xl:col-span-2">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>By category · click to hide</span>
                  {typeOff.length > 0 && <button type="button" className="text-primary hover:underline" onClick={() => setTypeOff([])}>Show all</button>}
                </div>
                <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                  {types.map((t) => {
                    const on = !typeOff.includes(t.type);
                    const isRevenue = t.revenue >= t.expenses;
                    const v = isRevenue ? t.revenue : t.expenses;
                    return (
                      <li key={t.type}>
                        <button type="button" aria-pressed={on} onClick={() => setTypeOff(toggle(typeOff, t.type))}
                          className={cn("grid w-full grid-cols-[8.5rem_1fr_auto] items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-gray-900", !on && "opacity-45")}>
                          <span className={cn("truncate text-gray-300", !on && "line-through")}>{t.type}</span>
                          <span className="h-2 rounded-sm bg-gray-900"><span className="block h-2 rounded-sm" style={{ width: `${Math.max(2, (v / typeMax) * 100)}%`, background: isRevenue ? BLUE : AMBER }} /></span>
                          <span className="tabular-nums text-gray-300">{money(v)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card id="leave" title={`Leave and MC${selectedName ? ` · ${selectedName}` : ""}`} sub="Approved days, by the month the leave starts"
            legend={leaveSeries.map((s) => ({ ...s, total: `${days(leaveTotal(s.key))} d` }))}
            table={{
              head: ["Month", ...leaveSeries.map((s) => s.label), "Total"],
              rows: leaveByMonth.map((d) => [d.title ?? d.label, ...leaveSeries.map((s) => days(d.values[s.key])), days(leaveSeries.reduce((t, s) => t + d.values[s.key], 0))]),
            }}>
            {leaveSeries.length === 0 ? <Empty>Every leave type is switched off.</Empty> : leaveRows.length === 0 ? <Empty>No approved leave in this period.</Empty> : (
              <BarChart data={leaveByMonth} series={leaveSeries} format={(v) => `${days(v)} d`} axisFormat={days} ariaLabel="Leave days by month"
                footer={(d) => ({ label: "Total", value: `${days(leaveSeries.reduce((t, s) => t + d.values[s.key], 0))} d` })} />
            )}
          </Card>
        </div>
        <div className="xl:col-span-2">
          <section className="h-full rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-white">By person</h2>
                <p className="text-xs text-gray-500">Click a name to show only that person</p>
              </div>
              {activePerson && <button type="button" onClick={() => setPerson("")} className="rounded-lg border border-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:text-white">Everyone</button>}
            </div>
            {byPerson.length === 0 ? <Empty>No approved leave in this period.</Empty> : (
              <div className="mt-3 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-950 text-left text-xs text-gray-500">
                    <tr><th className="py-1 pr-2 font-medium">Name</th>{leaveSeries.map((s) => <th key={s.key} className="px-2 text-right font-medium">{s.key === "NPL" ? "NPL" : s.label}</th>)}<th className="pl-2 text-right font-medium">Total</th></tr>
                  </thead>
                  <tbody>
                    {byPerson.map((p) => (
                      <tr key={p.id} className={cn("border-t border-gray-800", p.id === activePerson && "bg-gray-900")}>
                        <td className="max-w-[11rem] py-1.5 pr-2">
                          <button type="button" onClick={() => setPerson(p.id === activePerson ? "" : p.id)} className="block w-full truncate text-left text-gray-200 hover:text-primary" title={p.person.name}>
                            {p.person.name} <span className="text-xs text-gray-500">{p.person.intern ? "Intern" : "Staff"}</span>
                          </button>
                        </td>
                        {leaveSeries.map((s) => <td key={s.key} className="px-2 text-right tabular-nums text-gray-300">{days(p.v[s.key])}</td>)}
                        <td className="pl-2 text-right tabular-nums text-white">{days(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card id="headcount" title="Number of staff" sub="People employed on the last day of each month (today for the current month)"
            legend={headSeries.map((s) => ({ ...s, total: `${headNow[s.key] ?? 0} now` }))}
            table={{
              head: ["Month", ...headSeries.map((s) => s.label), "Total"],
              rows: headByMonth.map((d) => [d.title ?? d.label, ...headSeries.map((s) => String(d.values[s.key])), String(headTotal(d.values))]),
            }}>
            <BarChart data={headByMonth} series={headSeries} format={(v) => String(v)} ariaLabel="Headcount by month"
              footer={headSeries.length > 1 ? (d) => ({ label: "Total", value: String(headTotal(d.values)) }) : undefined} />
          </Card>
        </div>
        <div className="xl:col-span-2">
          <section className="h-full rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5">
            <h2 className="font-semibold text-white">Change by month</h2>
            <p className="text-xs text-gray-500">Headcount against the month before</p>
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-950 text-left text-xs text-gray-500">
                  <tr><th className="py-1 pr-2 font-medium">Month</th>{headSeries.map((s) => <th key={s.key} className="px-2 text-right font-medium">{s.label}</th>)}<th className="px-2 text-right font-medium">Total</th><th className="pl-2 text-right font-medium">Change</th></tr>
                </thead>
                <tbody>
                  {headByMonth.map((d, i) => {
                    const change = i === 0 ? null : headTotal(d.values) - headTotal(headByMonth[i - 1].values);
                    return (
                      <tr key={d.title} className="border-t border-gray-800">
                        <td className="py-1.5 pr-2 text-gray-200">{d.title}</td>
                        {headSeries.map((s) => <td key={s.key} className="px-2 text-right tabular-nums text-gray-300">{d.values[s.key]}</td>)}
                        <td className="px-2 text-right tabular-nums text-white">{headTotal(d.values)}</td>
                        <td className="pl-2 text-right tabular-nums text-gray-300">{change === null ? "" : change === 0 ? "0" : `${change > 0 ? "+" : "\u2212"}${Math.abs(change)}`}</td>
                      </tr>
                    );
                  }).reverse()}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-gray-800 bg-gray-900 p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1 transition-colors", value === o.value ? "bg-primary text-on-color" : "text-gray-400 hover:text-white")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub: string; href: string }) {
  return (
    <a href={href} className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 transition-colors hover:border-primary/60">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 truncate text-2xl font-bold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 truncate text-xs first-letter:uppercase text-gray-500">{sub}</div>
    </a>
  );
}

function Card({ id, title, sub, legend, table, children }: {
  id: string; title: string; sub: string;
  legend: { key: string; label: string; color: string; total: string }[];
  table: { head: string[]; rows: string[][] };
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
        <button type="button" onClick={() => setShowTable(!showTable)} aria-pressed={showTable} className="rounded-lg border border-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:text-white">
          {showTable ? "Chart" : "Table"}
        </button>
      </div>
      {legend.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-300">
          {legend.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label} <span className="tabular-nums text-gray-500">{s.total}</span>
            </span>
          ))}
        </div>
      )}
      {showTable ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr>{table.head.map((h, i) => <th key={h} className={cn("py-1 font-medium", i === 0 ? "pr-3" : "pl-3 text-right")}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r) => (
              <tr key={r[0]} className="border-t border-gray-800 text-gray-300">{r.map((c, i) => <td key={i} className={cn("py-1.5", i === 0 ? "pr-3" : "pl-3 text-right tabular-nums", i === r.length - 1 && i > 0 && "text-white")}>{c}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-6 pb-4 text-center text-sm text-gray-500">{children}</p>;
}
