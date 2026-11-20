"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Clock, Stethoscope, Receipt, CalendarCheck, CalendarDays, CalendarOff, Briefcase } from "lucide-react";

interface AdminStats {
  pendingLeaves: number;
  pendingMC: number;
  pendingClaims: number;
}

interface OtStats {
  earned: number;
  used: number;
  autoDeducted: number;
  remaining: number;
}

interface StaffStats {
  /**
   * The four leave figures of the decision email, in its order: paid leave taken, annual leave
   * balance, MC taken, no-pay leave taken. Built by buildLeaveSummary(); shown as given.
   */
  leave: { label: string; value: string; hint?: string }[];
  isIntern: boolean;
  otStats: OtStats | null;
}

/** Icon and colour for each leave tile, by its position in the summary. */
const LEAVE_TILE_STYLE = [
  { icon: CalendarCheck, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  { icon: CalendarDays, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  { icon: Stethoscope, iconBg: "bg-red-100", iconColor: "text-red-600" },
  { icon: CalendarOff, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
];

interface StatsCardsProps {
  adminStats: AdminStats | null;
  staffStats: StaffStats | null;
}

interface CardItem {
  title: string;
  value: string;
  sub?: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

export function StatsCards({ adminStats, staffStats }: StatsCardsProps) {
  const cards: CardItem[] = [];

  if (adminStats) {
    cards.push(
      { title: "Pending Leaves", value: String(adminStats.pendingLeaves), icon: Clock, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
      { title: "Pending MC", value: String(adminStats.pendingMC), icon: Stethoscope, iconBg: "bg-red-100", iconColor: "text-red-600" },
      { title: "Pending Claims", value: String(adminStats.pendingClaims), icon: Receipt, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
    );
  } else if (staffStats) {
    staffStats.leave.forEach((stat, i) => {
      // Interns have no paid MC: their sick leave is No Pay Leave.
      const sub = stat.hint ?? (staffStats.isIntern && stat.label === "MC taken" ? "Sick leave is No Pay Leave" : undefined);
      cards.push({ title: stat.label, value: stat.value, sub, href: "/leave", ...LEAVE_TILE_STYLE[i % LEAVE_TILE_STYLE.length] });
    });
    if (staffStats.otStats) {
      cards.push({
        title: "Off In Lieu",
        value: String(staffStats.otStats.remaining),
        icon: Briefcase,
        iconBg: staffStats.otStats.remaining < 0 ? "bg-red-100" : "bg-emerald-100",
        iconColor: staffStats.otStats.remaining < 0 ? "text-red-600" : "text-emerald-600",
      });
    }
  }

  const colClass = cards.length >= 5
    ? "grid-cols-2 lg:grid-cols-5"
    : cards.length === 4
      ? "grid-cols-2 lg:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-3 sm:gap-4 ${colClass}`}>
      {cards.map((card, index) => {
        const body = (
          <Card className="h-full border border-gray-800 bg-gray-950 transition-colors group-hover:border-primary/60">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-400">{card.title}</p>
                  <p className="text-2xl sm:text-3xl lg:text-3xl font-bold text-white mt-1.5">{card.value}</p>
                  {card.sub && <p className="mt-1 truncate text-xs text-gray-500">{card.sub}</p>}
                </div>
                <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 ${card.iconBg}`}>
                  <card.icon className={`h-6 w-6 sm:h-7 sm:w-7 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
        return card.href
          ? <Link key={index} href={card.href} className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">{body}</Link>
          : <div key={index}>{body}</div>;
      })}
    </div>
  );
}
