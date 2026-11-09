"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ListChecks, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { filterSops, groupSopsByCategory, type SopListItem } from "@/lib/sop-utils";

export function SopDirectory({ items }: { items: SopListItem[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const allGroups = useMemo(() => groupSopsByCategory(items), [items]);
  const matches = useMemo(() => filterSops(items, q), [items, q]);
  const groups = useMemo(
    () => groupSopsByCategory(category ? matches.filter((m) => m.category === category) : matches),
    [matches, category],
  );
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const filtering = q.trim().length > 0 || category !== null;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search procedures, e.g. refund, attendance, appeal, TPG, SkillsFuture Credit"
            className="pl-9 pr-9"
            aria-label="Search SOPs"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* One compact row of category filters; counts are for the current search. */}
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip label="All" count={matches.length} active={category === null} onClick={() => setCategory(null)} />
          {allGroups.map((g) => (
            <CategoryChip
              key={g.category}
              label={g.category}
              count={matches.filter((m) => m.category === g.category).length}
              active={category === g.category}
              onClick={() => setCategory(category === g.category ? null : g.category)}
            />
          ))}
        </div>

        {filtering && (
          <p className="text-xs text-gray-500">
            {shown} of {items.length} procedures
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-gray-800 px-4 py-12 text-center text-sm text-gray-400">
          No procedures match. Try a broader term.
        </div>
      ) : (
        // CSS columns pack the uneven category cards without gaps; order runs down each column.
        <div className={cn("gap-5", groups.length > 1 && "xl:columns-2")}>
          {groups.map((g) => (
            <section
              key={g.category}
              aria-labelledby={`sop-cat-${g.category}`}
              className="mb-5 break-inside-avoid rounded-xl border border-gray-800 bg-gray-900/40"
            >
              <header className="flex items-baseline justify-between gap-3 border-b border-gray-800 px-4 py-3">
                <div className="min-w-0">
                  <h2 id={`sop-cat-${g.category}`} className="text-base font-semibold text-white">
                    {g.category}
                  </h2>
                  {g.description && <p className="mt-0.5 truncate text-xs text-gray-500">{g.description}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                  {g.items.length}
                </span>
              </header>
              <ul className="divide-y divide-gray-800">
                {g.items.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/sop/${s.slug}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-800/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-100 group-hover:text-primary">{s.title}</div>
                        <div className="truncate text-xs text-gray-500">{s.summary}</div>
                      </div>
                      <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-gray-500 sm:inline-flex">
                        <ListChecks className="h-3.5 w-3.5" />
                        {s.stepCount}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-600 group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={count === 0 && !active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-gray-700 text-gray-300 hover:border-primary/60 hover:text-white",
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-gray-500")}>{count}</span>
    </button>
  );
}
