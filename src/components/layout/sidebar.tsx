"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email-templates/defaults";
import { useViewMode } from "./view-mode-context";
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
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  KeyRound,
  Mail,
  Webhook,
  CalendarDays,
  Stethoscope,
  ClipboardList,
  FolderOpen,
  FileSliders,
} from "lucide-react";

type IconType = React.ComponentType<{ className?: string }>;
type Grandchild = { name: string; href: string };
type Child = { name: string; href: string; icon?: IconType; children?: Grandchild[]; external?: boolean };
type NavItem = {
  name: string;
  adminName?: string; // override label shown in admin view
  href: string;
  icon: IconType;
  adminOnly?: true;
  noAccountant?: true;
  financeOnly?: true;
  hideForIntern?: true;
  staffOnly?: true;   // visible only in staff/intern view (hidden for admin + accountant)
  children?: Child[];
};

const navigation: NavItem[] = [
  { name: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { name: "My Profile", href: "/profile",     icon: User, noAccountant: true as const },
  { name: "Employees",       adminName: "Staff Management",   href: "/employees", icon: Users,      adminOnly:     true as const },
  {
    name: "Leave",
    adminName: "Leave Management",
    href: "/leave",
    icon: Clock,
    noAccountant: true as const,
    children: [
      { name: "Annual Leave",  href: "/leave/annual",  icon: CalendarDays },
      { name: "Medical Leave", href: "/leave/medical", icon: Stethoscope },
    ],
  },
  { name: "Expense Claims",  adminName: "Claim Management",   href: "/expenses",  icon: Receipt,    noAccountant:  true as const },
  { name: "Payroll",         adminName: "Payroll Management", href: "/payroll",   icon: DollarSign, hideForIntern: true as const },
  {
    name: "Accounting",
    href: "/accounting",
    icon: Calculator,
    financeOnly: true as const,
    children: [
      { name: "Expense Tracking", href: "/accounting/expense-tracking", icon: TrendingDown },
      { name: "Income Tracking",  href: "/accounting/income-tracking",  icon: TrendingUp   },
      {
        name: "Bank Statements",
        href: "https://drive.google.com/drive/u/1/folders/1U6MCWuKZQ4wWZqn36AVHUeOD7a-URAaY",
        icon: FolderOpen,
        external: true,
      },
    ],
  },
  { name: "Calendar",    href: "/calendar",    icon: Calendar,      noAccountant: true as const },
  { name: "Timesheet",  href: "/timesheet",   icon: ClipboardList, staffOnly:    true as const },
  { name: "Timesheet Overview", href: "/timesheet/overview", icon: ClipboardList, adminOnly: true as const },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    adminOnly: true as const,
    children: [
      { name: "Company Info", href: "/settings/company",     icon: Building2 },
      { name: "Credentials",  href: "/settings/credentials", icon: KeyRound },
      {
        name: "Email Templates",
        href: "/settings/email-templates",
        icon: Mail,
        children: TEMPLATE_KEYS.map((k) => ({
          name: TEMPLATES[k].label,
          href: `/settings/email-templates/${k.toLowerCase().replace(/_/g, "-")}`,
        })),
      },
      { name: "Leave Policy", href: "/settings/leave-policy", icon: FileSliders },
      { name: "Webhooks", href: "/settings/webhooks", icon: Webhook },
      { name: "Payslip Template", href: "/settings/payslip-template", icon: DollarSign },
      { name: "Cron Jobs", href: "/settings/cron-jobs", icon: Clock },
    ],
  },
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

  // viewAs is read from the client ViewModeContext — toggling it is a
  // synchronous React state update, no server round-trip, no flash.
  const { viewMode: viewAs } = useViewMode();
  const [collapsed, setCollapsed] = useState(false);

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
  // Intern view: admins respect viewAs; pure intern role always sees intern view
  const isInternView = isActualAdmin
    ? viewAs === "intern"
    : actualRoles.length > 0 && actualRoles.every((r) => r.toUpperCase() === "INTERN");

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
            if ("hideForIntern" in item && item.hideForIntern && isInternView) return null;
            if ("staffOnly" in item && item.staffOnly && (isAdmin || isAccountantView)) return null;
            return <TopLevelNavItem key={item.name} item={item} pathname={pathname} collapsed={collapsed} isAdmin={isAdmin} />;
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

// A top-level sidebar entry. When it has children, a chevron is shown that
// toggles the submenu; clicking the label/icon still navigates to the item's
// href. Default open state mirrors the route (open when the route is active);
// once the user clicks the chevron they take over the state.
function TopLevelNavItem({
  item,
  pathname,
  collapsed,
  isAdmin,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  isAdmin: boolean;
}) {
  const children = item.children;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  const expanded = manuallyOpen ?? isActive;
  const label = isAdmin && item.adminName ? item.adminName : item.name;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center rounded-xl text-sm font-medium transition-all",
          isActive && !children
            ? "bg-primary text-white"
            : isActive && children
              ? "bg-gray-800 text-white"
              : "text-gray-300 hover:bg-gray-800",
        )}
      >
        <Link
          href={item.href}
          title={collapsed ? label : undefined}
          className={cn(
            "flex items-center gap-x-3 flex-1 min-w-0 py-3",
            collapsed ? "justify-center px-2" : "px-3",
          )}
        >
          <item.icon
            className={cn(
              "h-5 w-5 shrink-0",
              isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200",
            )}
          />
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
        </Link>
        {!collapsed && children && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setManuallyOpen(!expanded);
            }}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={expanded}
            className="px-2.5 py-3 rounded-md hover:bg-gray-700/60 transition-colors shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 opacity-70" />
            ) : (
              <ChevronRight className="h-4 w-4 opacity-70" />
            )}
          </button>
        )}
      </div>

      {!collapsed && expanded && children && (
        <ul className="mt-1 ml-4 border-l border-gray-800 pl-3 space-y-1">
          {children.map((child) => (
            <NestedChildRow key={child.href} child={child} pathname={pathname} />
          ))}
        </ul>
      )}
    </li>
  );
}

// A second-level sidebar row that may itself have grandchildren (a third-level
// nested list). The chevron is a separate button that toggles open/close;
// the rest of the row remains a Link so clicking the label still navigates.
// Default open state mirrors the route — open when active.
function NestedChildRow({
  child,
  pathname,
}: {
  child: Child;
  pathname: string;
}) {
  const grandchildren = child.children;
  const childActive =
    pathname === child.href || pathname.startsWith(child.href + "/");
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  // route-driven default, overridable by user click
  const expanded = manuallyOpen ?? childActive;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center rounded-lg text-sm transition-all",
          childActive && !grandchildren
            ? "bg-primary text-white"
            : childActive && grandchildren
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-gray-100",
        )}
      >
        {child.external ? (
          <a
            href={child.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-x-3 flex-1 px-3 py-2 min-w-0"
          >
            {child.icon && (
              <child.icon className="h-4 w-4 shrink-0 text-gray-500 group-hover:text-gray-200" />
            )}
            <span className="flex-1 truncate">{child.name}</span>
          </a>
        ) : (
          <Link href={child.href} className="flex items-center gap-x-3 flex-1 px-3 py-2 min-w-0">
            {child.icon && (
              <child.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  childActive ? "text-white" : "text-gray-500 group-hover:text-gray-200",
                )}
              />
            )}
            <span className="flex-1 truncate">{child.name}</span>
          </Link>
        )}
        {grandchildren && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setManuallyOpen(!expanded);
            }}
            aria-label={expanded ? "Collapse submenu" : "Expand submenu"}
            aria-expanded={expanded}
            className="px-2 py-2 rounded-md hover:bg-gray-700/60 transition-colors shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            )}
          </button>
        )}
      </div>

      {grandchildren && expanded && (
        <ul className="mt-1 ml-3 border-l border-gray-800 pl-3 space-y-0.5">
          {grandchildren.map((g) => {
            const gActive = pathname === g.href;
            return (
              <li key={g.href}>
                <Link
                  href={g.href}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-xs transition-all",
                    gActive
                      ? "bg-primary/80 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-100",
                  )}
                >
                  {g.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
