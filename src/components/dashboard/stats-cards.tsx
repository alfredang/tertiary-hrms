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
   * The four leave figures of the decision email, in its order: annual leave taken, annual leave
   * balance, MC taken, no-pay leave taken. Built by buildLeaveSummary(); shown as given.
   */
  leave: { label: string; value: string; hint?: string }[];
  isIntern: boolean;
  otStats: OtStats | null;
}

/**
 * Icon and colour for each leave tile, by its position in the summary. Solid 600 fill with a white
 * icon: 600 is the same colour in the light and dark themes, so the icon stays clear in both
 * (a 100 tint turns dark in the light theme and the 600 icon disappears into it).
 */
const LEAVE_TILE_STYLE = [
  { icon: CalendarCheck, iconBg: "bg-emerald-600", iconColor: "text-on-color" },
  { icon: CalendarDays, iconBg: "bg-blue-600", iconColor: "text-on-color" },
  { icon: Stethoscope, iconBg: "bg-red-600", iconColor: "text-on-color" },
  { icon: CalendarOff, iconBg: "bg-amber-600", iconColor: "text-on-color" },
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
      { title: "Pending Leaves", value: String(adminStats.pendingLeaves), icon: Clock, iconBg: "bg-amber-600", iconColor: "text-on-color" },
      { title: "Pending MC", value: String(adminStats.pendingMC), icon: Stethoscope, iconBg: "bg-red-600", iconColor: "text-on-color" },
      { title: "Pending Claims", value: String(adminStats.pendingClaims), icon: Receipt, iconBg: "bg-purple-600", iconColor: "text-on-color" },
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
        href: "/leave/annual",
        icon: Briefcase,
        iconBg: staffStats.otStats.remaining < 0 ? "bg-red-600" : "bg-emerald-600",
        iconColor: "text-on-color",
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
