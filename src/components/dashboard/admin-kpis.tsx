import Link from "next/link";
import { Users, CalendarOff, Inbox, BellRing, CalendarDays, Stethoscope, Wallet, AlarmClock, ChevronRight } from "lucide-react";
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

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Eight clickable KPI tiles: one number each, one short context line, a link to the detail. */
export function AdminKpis(d: AdminKpiData) {
  const tiles = [
    { label: "Headcount", value: String(d.staff + d.interns), sub: `${d.staff} staff · ${d.interns} interns`, href: "/employees", icon: Users },
    {
      label: "On leave today", value: String(d.onLeaveToday.length),
      sub: d.onLeaveToday.length ? d.onLeaveToday.slice(0, 2).map((p) => p.name.split(" ")[0]).join(", ") + (d.onLeaveToday.length > 2 ? ` +${d.onLeaveToday.length - 2}` : "") : "Everyone in",
      href: "/calendar", icon: CalendarOff,
    },
    { label: "Pending approvals", value: String(d.pendingTotal), sub: d.pendingTotal ? "Leave, MC, claims, punches" : "Nothing waiting", href: "/dashboard/insights#approvals", icon: Inbox, attention: d.pendingTotal > 0 },
    { label: "Alerts", value: String(d.alertsTotal), sub: d.alertsHigh ? `${d.alertsHigh} high priority` : d.alertsTotal ? "No high priority" : "All clear", href: "/dashboard/insights#alerts", icon: BellRing, attention: d.alertsHigh > 0 },
    { label: "Leave days YTD", value: fmt(d.leaveYtd), sub: `${fmt(d.leaveMonth)} in ${d.monthLabel}`, href: "/dashboard/insights#leave", icon: CalendarDays },
    { label: "MC days YTD", value: fmt(d.mcYtd), sub: `${fmt(d.mcMonth)} in ${d.monthLabel}`, href: "/dashboard/insights#leave", icon: Stethoscope },
    { label: "No Pay Leave YTD", value: fmt(d.nplYtd), sub: `${fmt(d.nplMonth)} in ${d.monthLabel}`, href: "/dashboard/insights#leave", icon: Wallet },
    { label: "Intern hours (week)", value: fmt(d.internHoursWeek), sub: d.missingClockOuts ? `${d.missingClockOuts} missing clock-out${d.missingClockOuts > 1 ? "s" : ""}` : "No missing clock-outs", href: "/dashboard/insights#interns", icon: AlarmClock, attention: d.missingClockOuts > 0 },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </Link>
      ))}
    </div>
  );
}
