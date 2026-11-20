"use client";

import { useState } from "react";
import Link from "next/link";
import { AGE_GROUPS, ETHNIC_GROUPS, NOT_RECORDED, countBy, wholePercents, type BreakdownPerson } from "@/lib/demographics";
import { cn } from "@/lib/utils";

// Categorical slots validated with the dataviz validator on the light (#FFFFFF) and dark (#030712) cards.
const SLOTS = ["#5B82F0", "#22978B", "#BF8420", "#8E5FD0", "#D9627A"];
// Age is ordered, so it reads as one hue from light to dark instead of five unrelated colours.
const AGE_RAMP = ["#A9BEF7", "#7F9DF3", "#5B82F0", "#3D63D6", "#2A47A8"];
const GREY = "rgb(var(--hrms-gray-600))";

type Who = "staff" | "interns" | "all";
interface Slice { label: string; count: number; color: string }

/** Gender, age group and ethnic group of active people, as three donuts with one Staff / Interns / All control. */
export function WorkforceBreakdown({ people }: { people: BreakdownPerson[] }) {
  const [who, setWho] = useState<Who>("staff");
  const shown = people.filter((p) => who === "all" || (who === "interns") === p.intern);
  const paint = (rows: { label: string; count: number }[], order: readonly string[], colors: string[]): Slice[] =>
    rows.map((r) => ({ ...r, color: r.label === NOT_RECORDED ? GREY : colors[Math.max(0, order.indexOf(r.label)) % colors.length] }));

  const genderOrder = ["Male", "Female", "Other"];
  const charts = [
    { title: "Gender", slices: paint(countBy(shown, "gender", genderOrder), genderOrder, SLOTS) },
    { title: "Age group", slices: paint(countBy(shown, "ageGroup", AGE_GROUPS), AGE_GROUPS, AGE_RAMP) },
    { title: "Ethnic group", slices: paint(countBy(shown, "ethnicGroup", ETHNIC_GROUPS), ETHNIC_GROUPS, SLOTS) },
  ];
  const noun = who === "staff" ? "staff" : who === "interns" ? "interns" : "people";
  const ethnicMissing = shown.filter((p) => p.ethnicGroup === NOT_RECORDED).length;

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Workforce breakdown</h2>
          <p className="text-xs text-gray-500">{shown.length} active {noun}, by gender, age group and ethnic group</p>
        </div>
        <div role="tablist" aria-label="Who" className="inline-flex rounded-lg border border-gray-800 bg-gray-900 p-0.5 text-xs">
          {(["staff", "interns", "all"] as Who[]).map((w) => (
            <button key={w} type="button" role="tab" aria-selected={who === w} onClick={() => setWho(w)}
              className={cn("rounded-md px-3 py-1 capitalize transition-colors", who === w ? "bg-primary text-on-color" : "text-gray-400 hover:text-white")}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {charts.map((c) => <Donut key={c.title} title={c.title} slices={c.slices} noun={noun} />)}
      </div>
      {ethnicMissing > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          Ethnic group is not recorded for {ethnicMissing} of {shown.length}. Set it on each person&apos;s page in{" "}
          <Link href="/employees" className="text-primary hover:underline">Staff Management</Link>.
        </p>
      )}
    </section>
  );
}

function Donut({ title, slices, noun }: { title: string; slices: Slice[]; noun: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((t, s) => t + s.count, 0);
  const R = 42, r = 26, C = 50;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = total ? (s.count / total) * Math.PI * 2 : 0;
    const from = angle;
    angle += sweep;
    return { ...s, d: ring(C, C, R, r, from, angle) };
  });
  const focus = hover !== null ? slices[hover] : null;
  // Shares are rounded together so each chart's percentages add up to exactly 100.
  const shares = wholePercents(slices.map((s) => s.count));

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">No {noun} to show.</p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}>
            {arcs.map((a, i) => (
              <path key={a.label} d={a.d} fill={a.color} stroke="hsl(var(--card))" strokeWidth={1.5}
                opacity={hover === null || hover === i ? 1 : 0.35} tabIndex={0}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
            <text x={C} y={C - 1} textAnchor="middle" fontSize={15} fontWeight={600} fill="rgb(var(--hrms-ink))">{focus ? focus.count : total}</text>
            <text x={C} y={C + 10} textAnchor="middle" fontSize={6.5} fill="rgb(var(--hrms-gray-400))">{hover !== null ? `${shares[hover]}%` : noun}</text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-1 text-xs">
            {slices.map((s, i) => (
              <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                className={cn("flex items-center gap-2 rounded px-1 py-0.5", hover === i && "bg-gray-900")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="truncate text-gray-300">{s.label}</span>
                <span className="ml-auto whitespace-nowrap tabular-nums text-white">{s.count} <span className="text-gray-500">{shares[i]}%</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A ring segment between two angles (radians). A full circle is drawn as two halves. */
function ring(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI;
    return ring(cx, cy, R, r, a0, mid) + ring(cx, cy, R, r, mid, a0 + Math.PI * 2 - 1e-4);
  }
  const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(3)},${(cy + rad * Math.sin(a)).toFixed(3)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
}
