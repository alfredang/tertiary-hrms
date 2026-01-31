"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface RecentActivityProps {
  expenses: Array<{
    id: string;
    amount: any;
    description: string;
    createdAt: Date;
    employee: { firstName: string; lastName: string };
    category: { name: string };
  }>;
  leaves: Array<{
    id: string;
    days: any;
    startDate: Date;
    endDate: Date;
    createdAt: Date;
    employee: { firstName: string; lastName: string };
    leaveType: { name: string };
  }>;
}

export function RecentActivity({ expenses }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No recent activity
            </p>
          ) : (
            expenses.slice(0, 5).map((expense) => (
              <div key={expense.id} className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {expense.employee.firstName} {expense.employee.lastName.charAt(0)}.
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(Number(expense.amount))} - {expense.category.name}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
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
