"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface RecentActivityProps {
  expenses: Array<{
    id: string;
    amount: number;
    description: string;
    createdAt: string;
    employee: { name: string };
    category: { name: string };
  }>;
  leaves: Array<{
    id: string;
    days: number;
    startDate: string;
    endDate: string;
    createdAt: string;
    employee: { name: string };
    leaveType: { name: string };
  }>;
}

export function RecentActivity({ expenses }: RecentActivityProps) {
  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No recent activity
            </p>
          ) : (
            expenses.slice(0, 5).map((expense) => (
              <div key={expense.id} className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-900/30">
                  <DollarSign className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {expense.employee.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatCurrency(Number(expense.amount))} - {expense.category.name}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDate(expense.createdAt).split(" ").slice(0, 2).join(" ")}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
