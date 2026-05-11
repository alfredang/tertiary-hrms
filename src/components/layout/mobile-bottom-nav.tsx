"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, Clock, Receipt, DollarSign, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";

const allTabs = [
  { name: "Home",       href: "/dashboard",  icon: LayoutDashboard, financeOnly: false },
  { name: "Leave",      href: "/leave",      icon: Clock,           financeOnly: false },
  { name: "Expense Claims", href: "/expenses",   icon: Receipt,         financeOnly: true  },
  { name: "Payroll",    href: "/payroll",    icon: DollarSign,      financeOnly: true  },
  { name: "Accounting", href: "/accounting", icon: Calculator,      financeOnly: true  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const primaryRole: string = (session?.user as any)?.role ?? "STAFF";
  const actualRoles: string[] = (session?.user as any)?.roles ?? [primaryRole];
  const isActualAdmin = primaryRole === "ADMIN" || primaryRole === "HR" || primaryRole === "MANAGER";

  const [viewAs, setViewAs] = useState<string>("admin");

  useEffect(() => {
    const read = () => {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith("viewAs="));
      setViewAs(cookie ? cookie.split("=")[1] : "admin");
    };
    read();
    const interval = setInterval(read, 500);
    return () => clearInterval(interval);
  }, []);

  const canSeeFinance = isActualAdmin
    ? viewAs === "admin" || viewAs === "accountant"
    : actualRoles.includes("ACCOUNTANT");
  const tabs = allTabs.filter((t) => !t.financeOnly || canSeeFinance);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex justify-around">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
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
