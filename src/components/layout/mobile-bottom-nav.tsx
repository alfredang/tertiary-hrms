"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Receipt, DollarSign, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leave", href: "/leave", icon: Clock },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Payroll", href: "/payroll", icon: DollarSign },
  { name: "Calendar", href: "/calendar", icon: Calendar },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex justify-around">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex flex-col items-center py-2 px-3 text-xs min-w-[56px]",
                isActive ? "text-primary" : "text-gray-400"
              )}
            >
              <tab.icon className="h-5 w-5 mb-1" />
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
