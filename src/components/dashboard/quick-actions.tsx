"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, DollarSign, Calendar, ChevronRight } from "lucide-react";

const actions = [
  {
    title: "Add Employee",
    description: "Register new team member",
    href: "/employees/new",
    icon: Users,
    iconBg: "bg-blue-500",
  },
  {
    title: "Request Leave",
    description: "Submit time off request",
    href: "/leave/request",
    icon: Clock,
    iconBg: "bg-amber-500",
  },
  {
    title: "Submit Expense",
    description: "Claim reimbursement",
    href: "/expenses/submit",
    icon: DollarSign,
    iconBg: "bg-green-500",
  },
  {
    title: "View Calendar",
    description: "Check upcoming events",
    href: "/calendar",
    icon: Calendar,
    iconBg: "bg-red-500",
  },
];

interface QuickActionsProps {
  isAdmin?: boolean;
}

export function QuickActions({ isAdmin = true }: QuickActionsProps) {
  const visibleActions = isAdmin
    ? actions
    : actions.filter((a) => a.title !== "Add Employee");

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
                  <action.icon className="h-5 w-5 text-white" />
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
