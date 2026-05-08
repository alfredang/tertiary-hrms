"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
  Timer,
} from "lucide-react";

const navigation = [
  { name: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { name: "My Profile", href: "/profile",     icon: User },
  { name: "Employees",  href: "/employees",   icon: Users,      adminOnly:      true as const },
  { name: "Leave",      href: "/leave",       icon: Clock },
  { name: "Attendance", href: "/attendance",  icon: Timer },
  { name: "Expenses",   href: "/expenses",    icon: Receipt,    financeOnly:    true as const },
  { name: "Payroll",    href: "/payroll",     icon: DollarSign, financeOnly:    true as const },
  { name: "Calendar",   href: "/calendar",    icon: Calendar,   noAccountant:   true as const },
  { name: "Settings",   href: "/settings",    icon: Settings,   adminOnly:      true as const },
];

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const actualRoles: string[] = (session?.user as any)?.roles ?? (role ? [role] : ["STAFF"]);

  // Always start with "admin" so the server and client render identically on first paint.
  // The effect below syncs the real cookie value after hydration.
  const [viewAs, setViewAs] = useState<string>("admin");

  useEffect(() => {
    const readCookie = () => {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith("viewAs="));
      setViewAs(cookie ? cookie.split("=")[1] : "admin");
    };
    readCookie();
    const interval = setInterval(readCookie, 500);
    return () => clearInterval(interval);
  }, []);

  const isActualAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const isAdmin = isActualAdmin && viewAs === "admin";
  // Finance: admins respect viewAs; pure accountant role always sees finance
  const canSeeFinance = isActualAdmin
    ? viewAs === "admin" || viewAs === "accountant"
    : actualRoles.some((r) => r.toUpperCase() === "ACCOUNTANT");
  // Accountant view hides calendar (they use staff view for personal calendar)
  const isAccountantView = isActualAdmin
    ? viewAs === "accountant"
    : actualRoles.some((r) => r.toUpperCase() === "ACCOUNTANT") && !isActualAdmin;

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
            if ("adminOnly" in item && item.adminOnly && !isAdmin) return null;
            if ("financeOnly" in item && item.financeOnly && !canSeeFinance) return null;
            if ("noAccountant" in item && item.noAccountant && isAccountantView) return null;
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
                  {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
