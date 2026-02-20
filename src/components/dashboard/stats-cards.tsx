"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock, Stethoscope, Receipt, CalendarDays, DollarSign } from "lucide-react";

interface AdminStats {
  pendingLeaves: number;
  pendingMC: number;
  pendingClaims: number;
}

interface StaffStats {
  leaveBalance: number;
  mcBalance: number;
  expenseClaimAmount: number;
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
      { title: "Pending Leave Approval", value: String(adminStats.pendingLeaves), icon: Clock, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
      { title: "Pending MC Approval", value: String(adminStats.pendingMC), icon: Stethoscope, iconBg: "bg-red-100", iconColor: "text-red-600" },
      { title: "Pending Claim Approval", value: String(adminStats.pendingClaims), icon: Receipt, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
    );
  } else if (staffStats) {
    cards.push(
      { title: "Leave Balance", value: String(staffStats.leaveBalance), icon: CalendarDays, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
      { title: "MC Balance", value: String(staffStats.mcBalance), icon: Stethoscope, iconBg: "bg-red-100", iconColor: "text-red-600" },
      {
        title: "Expense Claims (YTD)",
        value: `$${staffStats.expenseClaimAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        icon: DollarSign,
        iconBg: "bg-green-100",
        iconColor: "text-green-600",
      },
    );
  }

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Card key={index} className="border border-gray-800 bg-gray-950">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">{card.title}</p>
                <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.iconBg}`}>
                <card.icon className={`h-6 w-6 ${card.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
