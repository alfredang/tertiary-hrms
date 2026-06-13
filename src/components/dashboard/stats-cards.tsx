"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock, Stethoscope, Receipt, CalendarDays, DollarSign, Briefcase } from "lucide-react";

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
  leaveBalance: number;
  mcBalance: number;
  expenseClaimAmount: number;
  otStats: OtStats | null;
}

interface StatsCardsProps {
  adminStats: AdminStats | null;
  staffStats: StaffStats | null;
}

interface CardItem {
  title: string;
  value: string;
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
    cards.push(
      { title: "Annual Leave", value: String(staffStats.leaveBalance), icon: CalendarDays, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
      { title: "Medical Leave", value: String(staffStats.mcBalance), icon: Stethoscope, iconBg: "bg-red-100", iconColor: "text-red-600" },
      {
        title: "Expense Claims",
        value: `$${staffStats.expenseClaimAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        icon: DollarSign,
        iconBg: "bg-green-100",
        iconColor: "text-green-600",
      },
    );
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

  const colClass = cards.length === 4
    ? "grid-cols-2 lg:grid-cols-4"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-3 sm:gap-4 ${colClass}`}>
      {cards.map((card, index) => (
        <Card key={index} className="border border-gray-800 bg-gray-950">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-400">{card.title}</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mt-1.5">{card.value}</p>
              </div>
              <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 ${card.iconBg}`}>
                <card.icon className={`h-6 w-6 sm:h-7 sm:w-7 ${card.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
