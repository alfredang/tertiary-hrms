"use client";

import { useMemo, useState } from "react";
import type { LeaveCategory, MonthlyLeavePoint } from "@/lib/hr-insights";
import { cn } from "@/lib/utils";

// Categorical slots validated with the dataviz validator (light surface, 10 Nov 2026; earlier dark): all checks pass.
// Fixed order — colour follows the category, never its rank.
const SERIES: { key: LeaveCategory; label: string; color: string }[] = [
  { key: "LEAVE", label: "Leave", color: "#5B82F0" },
  { key: "MC", label: "MC", color: "#22978B" },
  { key: "NPL", label: "No Pay Leave", color: "#BF8420" },
];
type Who = "all" | "staff" | "interns";
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function LeaveTrendChart({ data, year }: { data: MonthlyLeavePoint[]; year: number }) {
  const [who, setWho] = useState<Who>("all");
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const rows = useMemo(
    () =>
      data.map((p) => {
        const pick = (k: LeaveCategory) => (who === "staff" ? p.staff[k] : who === "interns" ? p.interns[k] : p.staff[k] + p.interns[k]);
        const v = { LEAVE: pick("LEAVE"), MC: pick("MC"), NPL: pick("NPL") };
        return { month: p.month, v, total: v.LEAVE + v.MC + v.NPL };
      }),
    [data, who],
  );
  const totals = SERIES.map((s) => ({ ...s, total: rows.reduce((t, r) => t + r.v[s.key], 0) }));
  const max = Math.max(4, ...rows.map((r) => r.total));
  const niceMax = Math.ceil(max / 4) * 4;

  // Geometry (viewBox units; the SVG scales to the card width)
  const W = 640, H = 220, padL = 28, padB = 22, padT = 8;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = plotW / Math.max(rows.length, 1);
  const barW = Math.min(28, slot * 0.55);
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Leave taken by month · {year}</h2>
          <p className="text-xs text-gray-500">Approved days, by the month the leave starts</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Who" className="inline-flex rounded-lg border border-gray-800 bg-gray-900 p-0.5 text-xs">
            {(["all", "staff", "interns"] as Who[]).map((w) => (
              <button key={w} role="tab" aria-selected={who === w} onClick={() => setWho(w)}
                className={cn("rounded-md px-3 py-1 capitalize transition-colors", who === w ? "bg-primary text-on-color" : "text-gray-400 hover:text-white")}>
                {w}
              </button>
            ))}
          </div>
          <button onClick={() => setTable(!table)} className="rounded-lg border border-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:text-white" aria-pressed={table}>
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {/* Legend: always present for ≥2 series; text in ink colours, the swatch carries identity */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-300">
        {totals.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label} <span className="tabular-nums text-gray-500">{fmt(s.total)} d</span>
          </span>
        ))}
      </div>

      {table ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="py-1 pr-3">Month</th>{SERIES.map((s) => <th key={s.key} className="pr-3 text-right">{s.label}</th>)}<th className="text-right">Total</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.month} className="border-t border-gray-800 text-gray-300"><td className="py-1.5 pr-3">{r.month}</td>{SERIES.map((s) => <td key={s.key} className="pr-3 text-right tabular-nums">{fmt(r.v[s.key])}</td>)}<td className="text-right tabular-nums text-white">{fmt(r.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Leave days by month, ${who}`}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={padL} x2={W} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="hsl(var(--border))" strokeWidth={1} />
                <text x={padL - 6} y={y(niceMax * f) + 3} textAnchor="end" fontSize={10} fill="rgb(var(--hrms-gray-400))">{fmt(niceMax * f)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cx = padL + slot * i + slot / 2;
              let base = padT + plotH;
              const segs = SERIES.filter((s) => r.v[s.key] > 0);
              return (
                <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${r.month}: ${SERIES.map((s) => `${s.label} ${fmt(r.v[s.key])}`).join(", ")}`}>
                  {/* hit target larger than the mark */}
                  <rect x={cx - slot / 2} y={padT} width={slot} height={plotH} fill={hover === i ? "#2F5BE60D" : "transparent"} />
                  {segs.map((s, j) => {
                    const h = Math.max(1, (r.v[s.key] / niceMax) * plotH);
                    const top = base - h;
                    const isTop = j === segs.length - 1;
                    const el = (
                      <path key={s.key} fill={s.color}
                        d={isTop ? roundedTop(cx - barW / 2, top, barW, h, 4) : `M${cx - barW / 2},${top}h${barW}v${h}h${-barW}z`} />
                    );
                    base = top - 2; // 2px surface gap between stacked segments
                    return el;
                  })}
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={hover === i ? "rgb(var(--hrms-ink))" : "rgb(var(--hrms-gray-400))"}>{r.month}</text>
                </g>
              );
            })}
          </svg>
          {hover !== null && rows[hover] && (
            <div className="pointer-events-none absolute top-1 rounded-lg border border-gray-700 bg-gray-900/95 px-3 py-2 text-xs shadow-lg"
              // Sit beside the hovered bar (left of it in the right half), never on top of the mark being read.
              style={{
                left: `${((padL + slot * hover + slot / 2) / W) * 100}%`,
                transform: hover >= rows.length / 2 ? `translateX(calc(-100% - ${barW / 2 + 10}px))` : `translateX(${barW / 2 + 10}px)`,
              }}>
              <div className="mb-1 font-medium text-white">{rows[hover].month} · {fmt(rows[hover].total)} days</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-2 whitespace-nowrap text-gray-300">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}<span className="ml-auto pl-3 tabular-nums">{fmt(rows[hover].v[s.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Bar segment with 4px rounded top corners, square at the baseline side. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
