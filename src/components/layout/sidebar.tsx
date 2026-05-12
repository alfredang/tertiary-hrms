"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
  Calculator,
  TrendingDown,
  TrendingUp,
  Calendar,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const navigation = [
  { name: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { name: "My Profile", href: "/profile",     icon: User },
  { name: "Employees",  href: "/employees",   icon: Users,      adminOnly:      true as const },
  { name: "Leave",      href: "/leave",       icon: Clock },
  { name: "Expense Claims", href: "/expenses",    icon: Receipt,    financeOnly:    true as const },
  { name: "Payroll",    href: "/payroll",     icon: DollarSign, financeOnly:    true as const },
  {
    name: "Accounting",
    href: "/accounting",
    icon: Calculator,
    financeOnly: true as const,
    children: [
      { name: "Expense Tracking", href: "/accounting/expense-tracking", icon: TrendingDown },
      { name: "Income Tracking",  href: "/accounting/income-tracking",  icon: TrendingUp   },
    ],
  },
  { name: "Calendar",   href: "/calendar",    icon: Calendar,   noAccountant:   true as const },
  { name: "Settings",   href: "/settings",    icon: Settings,   adminOnly:      true as const },
];

export function Sidebar({
  role,
  companyShortName,
  companyLogo,
}: {
  role?: string;
  companyShortName?: string;
  companyLogo?: string | null;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const actualRoles: string[] = (session?.user as any)?.roles ?? (role ? [role] : ["STAFF"]);

  // Always start with "admin" so the server and client render identically on first paint.
  // The effect below syncs the real cookie value after hydration.
  const [viewAs, setViewAs] = useState<string>("admin");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const readCookie = () => {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith("viewAs="));
      setViewAs(cookie ? cookie.split("=")[1] : "admin");
    };
    readCookie();
    const interval = setInterval(readCookie, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed") === "true";
    setCollapsed(stored);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "5rem" : "18rem");
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

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
    <div className={cn("flex grow flex-col gap-y-5 pt-4", collapsed ? "px-2" : "px-6")}>
      {/* Logo + collapse toggle */}
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "flex-col gap-2" : "gap-3")}>
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center overflow-hidden shrink-0">
          {companyLogo ? (
            <Image src={companyLogo} alt="Logo" width={40} height={40} className="object-contain" unoptimized />
          ) : (
            <span className="text-lg font-bold text-white">HR</span>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white line-clamp-2 leading-tight">{companyShortName ?? "HR Portal"}</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-1">
          {navigation.map((item) => {
            if ("adminOnly" in item && item.adminOnly && !isAdmin) return null;
            if ("financeOnly" in item && item.financeOnly && !canSeeFinance) return null;
            if ("noAccountant" in item && item.noAccountant && isAccountantView) return null;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const children = "children" in item ? item.children : undefined;
            const childExpanded = !!children && isActive;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    "group flex items-center gap-x-3 rounded-xl py-3 text-sm font-medium transition-all",
                    collapsed ? "justify-center px-2" : "px-3",
                    isActive && !children
                      ? "bg-primary text-white"
                      : isActive && children
                        ? "bg-gray-800 text-white"
                        : "text-gray-300 hover:bg-gray-800"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200"
                    )}
                  />
                  {!collapsed && item.name}
                  {!collapsed && isActive && !children && <ChevronRight className="ml-auto h-4 w-4" />}
                </Link>
                {!collapsed && childExpanded && children && (
                  <ul className="mt-1 ml-4 border-l border-gray-800 pl-3 space-y-1">
                    {children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={cn(
                              "group flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm transition-all",
                              childActive
                                ? "bg-primary text-white"
                                : "text-gray-400 hover:bg-gray-800 hover:text-gray-100",
                            )}
                          >
                            <child.icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                childActive ? "text-white" : "text-gray-500 group-hover:text-gray-200",
                              )}
                            />
                            {child.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {!collapsed && (
        <div className="pb-3 text-left text-xs text-gray-500">
          version {process.env.NEXT_PUBLIC_BUILD_DATE} ({process.env.NEXT_PUBLIC_GIT_COMMIT})
        </div>
      )}
    </div>
  );
}
