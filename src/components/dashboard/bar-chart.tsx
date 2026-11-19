"use client";

import { useState } from "react";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}
export interface BarDatum {
  label: string; // x-axis tick, e.g. "Nov"
  title?: string; // tooltip heading, e.g. "Nov 2026"
  values: Record<string, number>;
}

/**
 * Stacked or grouped bars on one axis, with a hover tooltip and keyboard focus per column.
 * Colours come from the caller (validated categorical slots); text stays in ink colours.
 */
export function BarChart({
  data,
  series,
  mode = "stacked",
  format,
  axisFormat,
  ariaLabel,
  footer,
}: {
  data: BarDatum[];
  series: BarSeries[];
  mode?: "stacked" | "grouped";
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  ariaLabel: string;
  /** Extra tooltip line computed per column, e.g. the net of two series. */
  footer?: (d: BarDatum) => { label: string; value: string } | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const axis = axisFormat ?? format;
  const colMax = (d: BarDatum) =>
    mode === "stacked" ? series.reduce((t, s) => t + (d.values[s.key] ?? 0), 0) : Math.max(0, ...series.map((s) => d.values[s.key] ?? 0));
  const niceMax = niceCeil(Math.max(0, ...data.map(colMax)));

  const W = 640, H = 230, padL = 44, padB = 22, padT = 8;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = plotW / Math.max(data.length, 1);
  const groupW = Math.min(mode === "grouped" ? 44 : 28, slot * 0.62);
  const gap = 2;
  const barW = mode === "grouped" ? (groupW - gap * (series.length - 1)) / series.length : groupW;
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  return (
    <div className="relative mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={padL - 6} y={y(niceMax * f) + 3} textAnchor="end" fontSize={10} fill="rgb(var(--hrms-gray-400))">{axis(niceMax * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          let base = padT + plotH;
          const shown = mode === "stacked" ? series.filter((s) => (d.values[s.key] ?? 0) > 0) : series;
          return (
            <g key={`${d.label}-${i}`} tabIndex={0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${d.title ?? d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(", ")}`}>
              <rect x={cx - slot / 2} y={padT} width={slot} height={plotH} fill={hover === i ? "rgb(var(--hrms-gray-900))" : "transparent"} />
              {shown.map((s, j) => {
                const v = d.values[s.key] ?? 0;
                if (v <= 0) return null;
                const h = Math.max(1, (v / niceMax) * plotH);
                if (mode === "grouped") {
                  const x = cx - groupW / 2 + j * (barW + gap);
                  return <path key={s.key} fill={s.color} d={roundedTop(x, padT + plotH - h, barW, h, 4)} />;
                }
                const top = base - h;
                const isTop = j === shown.length - 1;
                const el = <path key={s.key} fill={s.color} d={isTop ? roundedTop(cx - barW / 2, top, barW, h, 4) : `M${cx - barW / 2},${top}h${barW}v${h}h${-barW}z`} />;
                base = top - gap;
                return el;
              })}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={hover === i ? "rgb(var(--hrms-ink))" : "rgb(var(--hrms-gray-400))"}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((padL + slot * hover + slot / 2) / W) * 100}%`,
            transform: hover >= data.length / 2 ? `translateX(calc(-100% - ${groupW / 2 + 10}px))` : `translateX(${groupW / 2 + 10}px)`,
          }}>
          <div className="mb-1 whitespace-nowrap font-medium text-white">{data[hover].title ?? data[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 whitespace-nowrap text-gray-300">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}
              <span className="ml-auto pl-4 tabular-nums">{format(data[hover].values[s.key] ?? 0)}</span>
            </div>
          ))}
          {(() => {
            const f = footer?.(data[hover]);
            return f ? (
              <div className="mt-1 flex gap-2 whitespace-nowrap border-t border-gray-800 pt-1 text-gray-300">
                {f.label}<span className="ml-auto pl-4 tabular-nums text-white">{f.value}</span>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

/** Round an axis maximum up so that the top and the midpoint are both round numbers (minimum 4). */
export function niceCeil(v: number): number {
  if (v <= 4) return 4;
  if (v <= 10) return Math.ceil(v / 2) * 2;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10]) if (v <= step * pow) return step * pow;
  return 10 * pow;
}

/** Bar with 4px rounded top corners, square at the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
