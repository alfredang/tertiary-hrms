import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiTile {
  label: string;
  value: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  /** Amber: something is waiting for this person. */
  attention?: boolean;
}

/** One row of clickable KPI tiles; each opens its detail. Shared by every role's dashboard row. */
export function KpiTiles({ tiles, title }: { tiles: KpiTile[]; title?: string }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="group rounded-2xl border border-gray-800 bg-gray-950/80 p-4 sm:p-5 transition-colors hover:border-primary/60 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm text-gray-400">{t.label}</span>
              <t.icon className={cn("h-4 w-4", t.attention ? "text-amber-400" : "text-gray-500 group-hover:text-primary")} />
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-white">{t.value}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className={cn("truncate text-xs", t.attention ? "text-amber-300" : "text-gray-500")}>{t.sub}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
