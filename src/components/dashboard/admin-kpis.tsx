import { Users, GraduationCap, Inbox } from "lucide-react";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";

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
  return (
    <KpiTiles
      tiles={[
        { label: "Full-time staff", value: String(d.staff), sub: "Active staff", href: "/employees", icon: Users },
        { label: "Interns", value: String(d.interns), sub: "Active interns", href: "/interns", icon: GraduationCap },
        { label: "Pending approvals", value: String(d.pendingTotal), sub: d.pendingTotal ? "Leave, MC, claims, punches" : "Nothing waiting", href: "/dashboard/insights#approvals", icon: Inbox, attention: d.pendingTotal > 0 },
      ]}
    />
  );
}
