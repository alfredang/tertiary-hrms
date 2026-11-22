"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ListChecks, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { filterSops, groupSopsByCategory, type SopListItem } from "@/lib/sop-utils";

// Filter bar in the same style as the Trainers directory: search + Category dropdown in one card,
// result count and "Clear filters" underneath. Search and category live in the URL (?q=, ?cat=).
export function SopDirectory({ items }: { items: SopListItem[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const allGroups = useMemo(() => groupSopsByCategory(items), [items]);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [category, setCategory] = useState<string>(() => {
    const c = sp.get("cat") ?? "";
    return allGroups.some((g) => g.category === c) ? c : "";
  });

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (category) p.set("cat", category);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, category, pathname, router]);

  const matches = useMemo(() => filterSops(items, q), [items, q]);
  const groups = useMemo(
    () => groupSopsByCategory(category ? matches.filter((m) => m.category === category) : matches),
    [matches, category],
  );
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const filtering = q.trim().length > 0 || category !== "";

  return (
    <div className="space-y-5">
      <Card className="space-y-2 p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
          {/* Counts follow the current search. */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm sm:w-64"
            aria-label="Category"
          >
            <option value="">All categories ({matches.length})</option>
            {allGroups.map((g) => (
              <option key={g.category} value={g.category}>
                {g.category} ({matches.filter((m) => m.category === g.category).length})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
          <span className="text-muted-foreground">
            {filtering ? `${shown} of ${items.length}` : items.length} {items.length === 1 ? "procedure" : "procedures"}
          </span>
          {category && (
            <button
              type="button"
              onClick={() => setCategory("")}
              aria-label={`Remove ${category}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:border-primary/60"
            >
              {category} <X className="h-3 w-3" />
            </button>
          )}
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setCategory("");
              }}
              className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      </Card>

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
              className="mb-5 break-inside-avoid rounded-xl border border-gray-700 bg-gray-950 shadow-sm"
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
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 group-hover:text-primary" />
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
