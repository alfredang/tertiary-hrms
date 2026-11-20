"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, DollarSign, Calendar, ChevronRight, AlarmClockOff, TrendingUp, TrendingDown, Scale } from "lucide-react";

const adminActions = [
  {
    title: "Create Staff",
    description: "Register a new staff member",
    href: "/employees/new",
    icon: Users,
    iconBg: "bg-blue-500",
  },
  {
    title: "Manage Leaves",
    description: "Review leave requests",
    href: "/leave",
    icon: Clock,
    iconBg: "bg-amber-600",
  },
  {
    title: "Manage Claims",
    description: "Review expense claims",
    href: "/expenses",
    icon: DollarSign,
    iconBg: "bg-green-600",
  },
  {
    title: "View Calendar",
    description: "Check upcoming events",
    href: "/calendar",
    icon: Calendar,
    iconBg: "bg-red-500",
  },
];

const staffActions = [
  {
    title: "Request Leave",
    description: "Submit time off request",
    href: "/leave/request",
    icon: Clock,
    iconBg: "bg-amber-600",
  },
  {
    title: "Request Time Off",
    description: "Exams, emergency, others",
    href: "/time-off/request",
    icon: AlarmClockOff,
    iconBg: "bg-orange-600",
  },
  {
    title: "Submit Expense",
    description: "Claim reimbursement",
    href: "/expenses/submit",
    icon: DollarSign,
    iconBg: "bg-green-600",
  },
  {
    title: "View Calendar",
    description: "Check upcoming events",
    href: "/calendar",
    icon: Calendar,
    iconBg: "bg-red-500",
  },
];

// Accountant view is finance only (Alfred, 20 Nov 2026).
const accountantActions = [
  {
    title: "Manage Claims",
    description: "Review expense claims",
    href: "/expenses",
    icon: DollarSign,
    iconBg: "bg-green-600",
  },
  {
    title: "Income Tracking",
    description: "Bank credits by month",
    href: "/accounting/income-tracking",
    icon: TrendingUp,
    iconBg: "bg-blue-500",
  },
  {
    title: "Expense Tracking",
    description: "Bank debits by month",
    href: "/accounting/expense-tracking",
    icon: TrendingDown,
    iconBg: "bg-red-500",
  },
  {
    title: "Bank Reconciliation",
    description: "Match bank against QuickBooks",
    href: "/accounting/reconciliation",
    icon: Scale,
    iconBg: "bg-amber-600",
  },
];

interface QuickActionsProps {
  isAdmin?: boolean;
  /** Finance actions; wins over `isAdmin`. */
  isAccountant?: boolean;
}

export function QuickActions({ isAdmin = true, isAccountant = false }: QuickActionsProps) {
  const visibleActions = isAccountant ? accountantActions : isAdmin ? adminActions : staffActions;

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-800 hover:border-gray-700 hover:bg-gray-900 transition-all cursor-pointer">
                <div className={`p-3 rounded-xl ${action.iconBg}`}>
                  <action.icon className="h-5 w-5 text-on-color" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{action.title}</p>
                  <p className="text-sm text-gray-400 truncate">{action.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-500" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
