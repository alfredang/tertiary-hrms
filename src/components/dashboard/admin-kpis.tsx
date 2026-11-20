import Link from "next/link";
import { Users, GraduationCap, Inbox, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminKpiData {
  staff: number;
  interns: number;
  onLeaveToday: { name: string; category: string }[];
  pendingTotal: number;
  alertsTotal: number;
  alertsHigh: number;
  leaveYtd: number;
  mcYtd: number;
  nplYtd: number;
  leaveMonth: number;
  mcMonth: number;
  nplMonth: number;
  internHoursWeek: number;
  missingClockOuts: number;
  monthLabel: string;
}

/**
 * Three clickable KPI tiles (Alfred, 20 Nov 2026: staff, interns, pending approvals only).
 * Leave, MC, alerts and intern hours stay one click away on Analytics and HR Insights.
 */
export function AdminKpis(d: AdminKpiData) {
  const tiles: { label: string; value: string; sub: string; href: string; icon: typeof Users; attention?: boolean }[] = [
    { label: "Full-time staff", value: String(d.staff), sub: "Active staff", href: "/employees", icon: Users },
    { label: "Interns", value: String(d.interns), sub: "Active interns", href: "/interns", icon: GraduationCap },
    { label: "Pending approvals", value: String(d.pendingTotal), sub: d.pendingTotal ? "Leave, MC, claims, punches" : "Nothing waiting", href: "/dashboard/insights#approvals", icon: Inbox, attention: d.pendingTotal > 0 },
  ];
  return (
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
  );
}
