"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  User,
  Clock,
  Receipt,
  DollarSign,
  Calendar,
  Settings,
  ChevronRight,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "My Profile", href: "/profile", icon: User },
  { name: "Employees", href: "/employees", icon: Users, adminOnly: true as const },
  { name: "Leave", href: "/leave", icon: Clock },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Payroll", href: "/payroll", icon: DollarSign },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Settings", href: "/settings", icon: Settings, adminOnly: true as const },
];

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname();
  const [viewAs, setViewAs] = useState<string>(() => {
    if (typeof document !== "undefined") {
      const cookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("viewAs="));
      if (cookie) return cookie.split("=")[1];
    }
    return "admin";
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const cookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("viewAs="));
      const val = cookie ? cookie.split("=")[1] : "admin";
      setViewAs(val);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const isAdmin = (role === "ADMIN" || role === "HR") && viewAs === "admin";

  return (
    <div className="flex grow flex-col gap-y-5 px-6 pt-4">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
          <span className="text-lg font-bold text-white">HR</span>
        </div>
        <div>
          <p className="font-semibold text-white">HR Portal</p>
          <p className="text-xs text-gray-400">Management System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-1">
          {navigation.map((item) => {
            // Hide admin-only items from non-admin users
            if ("adminOnly" in item && item.adminOnly && !isAdmin) return null;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-x-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-300 hover:bg-gray-800"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200"
                    )}
                  />
                  {item.name}
                  {isActive && (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
