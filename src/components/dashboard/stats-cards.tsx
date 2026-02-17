"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, Receipt, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface StatsCardsProps {
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    pendingLeaves: number;
    pendingExpenses: number;
    totalExpensesThisMonth: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Employees",
      value: stats.totalEmployees,
      subtitle: `${stats.activeEmployees} active`,
      icon: Users,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Pending Leaves",
      value: stats.pendingLeaves,
      subtitle: "Awaiting approval",
      icon: Clock,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      title: "Pending Expenses",
      value: stats.pendingExpenses,
      subtitle: "To review",
      icon: Receipt,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "Total Expenses",
      value: formatCurrency(stats.totalExpensesThisMonth),
      subtitle: "This month",
      icon: DollarSign,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      isAmount: true,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Card key={index} className="border border-gray-800 bg-gray-950">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">{card.title}</p>
                <p className={`text-2xl font-bold text-white mt-1 ${card.isAmount ? 'text-xl' : ''}`}>
                  {card.value}
                </p>
                <p className="text-sm text-gray-400 mt-1">{card.subtitle}</p>
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
