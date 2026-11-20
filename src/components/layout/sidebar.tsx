"use client";

import { Fragment, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email-templates/defaults";
import { useViewMode } from "./view-mode-context";
import { hasTrainerAdminAccess } from "@/lib/trainer-access-client";
import {
  LayoutDashboard,
  Users,
  UserPlus,
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
  BookOpen,
  ShieldCheck,
  Timer,
  AlarmClock,
  GraduationCap,
  Scale,
  RotateCcw,
} from "lucide-react";

type IconType = React.ComponentType<{ className?: string }>;
type Grandchild = { name: string; href: string };
type Child = {
  name: string;
  href: string;
  icon?: IconType;
  children?: Grandchild[];
  external?: boolean;
  adminOnly?: true;
  exact?: true; // match the route exactly instead of by prefix
};
type NavItem = {
  name: string;
  adminName?: string; // override label shown in admin view
  href: string;
  icon: IconType;
  adminOnly?: true;
  noAccountant?: true;
  financeOnly?: true;
  hideForIntern?: true;
  internOnly?: true;  // visible only in intern view (and accountant view when allowAccountant is set)
  staffOnly?: true;   // visible only in staff/intern view (hidden for admin + accountant)
  allowAccountant?: true; // exception: a staffOnly item that should ALSO show in accountant view
  trainerAdminOnly?: true; // visible only to holders of the TRAINER_ADMIN role, in every view
  children?: Child[];
};

type NavGroup = {
  id: string;
  /** Section heading. A group without one (Dashboard) is always shown and cannot be folded. */
  label?: string;
  items: NavItem[];
};

// Sidebar sections (Alfred, 20 Nov 2026). Each heading folds its section; rows keep the same
// indentation as before. A section with nothing visible for the current role/view is not drawn.
const navigationGroups: NavGroup[] = [
  {
    id: "home",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    id: "my-stuff",
    label: "My Stuff",
    items: [
      // Shown in every view, the accountant view included (Alfred, 20 Nov 2026).
      { name: "My Profile", href: "/profile", icon: User },
      { name: "Calendar", href: "/calendar", icon: Calendar },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { name: "Employees", adminName: "Staff Management", href: "/employees", icon: Users, adminOnly: true as const },
      { name: "Intern Management", href: "/interns", icon: UserPlus, adminOnly: true as const },
      { name: "Trainer Admin", href: "/trainers", icon: GraduationCap, trainerAdminOnly: true as const },
    ],
  },
  {
    id: "processes",
    label: "Processes",
    items: [
      {
        name: "Leave",
        adminName: "Leave Management",
        href: "/leave",
        icon: Clock,
        noAccountant: true as const,
        children: [
          { name: "Annual Leave", href: "/leave/annual", icon: CalendarDays },
          { name: "Medical Leave", href: "/leave/medical", icon: Stethoscope },
          // Pay back No Pay Leave by working an off day (staff and interns).
          { name: "Payback", href: "/leave/payback", icon: RotateCcw },
        ],
      },
      { name: "Time Off", adminName: "Time Off Approvals", href: "/time-off", icon: Timer, noAccountant: true as const },
      // Clock In/Out and Timesheet: interns, plus the accountant view (Alfred, 20 Nov 2026).
      { name: "Clock In/Out", href: "/attendance", icon: AlarmClock, staffOnly: true as const, allowAccountant: true as const },
      // Timesheets are for interns (and the accountant view). Staff log weekend / public-holiday work for Off In Lieu on the same page.
      { name: "Timesheet", href: "/timesheet", icon: ClipboardList, staffOnly: true as const, internOnly: true as const, allowAccountant: true as const },
      { name: "Off In Lieu", href: "/timesheet", icon: ClipboardList, staffOnly: true as const, hideForIntern: true as const },
      // Admin: one Timesheet page (intern clock-in days/hours, missing punches, Off In Lieu approvals)
      { name: "Timesheet", href: "/timesheet/overview", icon: ClipboardList, adminOnly: true as const },
      { name: "Woods Square Invite", href: "/woods-square", icon: Building2, adminOnly: true as const },
      { name: "Woods Square Access", href: "/woods-square-access", icon: KeyRound, staffOnly: true as const, allowAccountant: true as const },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        name: "Payroll",
        adminName: "Payroll Management",
        href: "/payroll",
        icon: DollarSign,
        hideForIntern: true as const,
        children: [
          { name: "Payroll", href: "/payroll", icon: DollarSign, exact: true as const },
          { name: "Upload CPF", href: "/payroll/generate", icon: ShieldCheck, adminOnly: true as const },
        ],
      },
      { name: "Expense Claims", adminName: "Claim Management", href: "/expenses", icon: Receipt, noAccountant: true as const },
      {
        name: "Accounting",
        href: "/accounting",
        icon: Calculator,
        financeOnly: true as const,
        children: [
          { name: "Expense Tracking", href: "/accounting/expense-tracking", icon: TrendingDown },
          { name: "Income Tracking", href: "/accounting/income-tracking", icon: TrendingUp },
          { name: "Bank Reconciliation", href: "/accounting/reconciliation", icon: Scale },
          {
            name: "Bank Statements",
            href: "https://drive.google.com/drive/u/1/folders/1U6MCWuKZQ4wWZqn36AVHUeOD7a-URAaY",
            icon: FolderOpen,
            external: true,
          },
        ],
      },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    items: [{ name: "SOP", href: "/sop", icon: BookOpen }],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        adminOnly: true as const,
        children: [
          { name: "Company Info", href: "/settings/company", icon: Building2 },
          { name: "Credentials", href: "/settings/credentials", icon: KeyRound },
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
    ],
  },
];

const CLOSED_GROUPS_KEY = "sidebarClosedGroups";

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

  // Sections the user folded, remembered per browser. Everything is open by default.
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CLOSED_GROUPS_KEY) ?? "[]");
      if (Array.isArray(stored)) setClosedGroups(stored.filter((g) => typeof g === "string"));
    } catch {
      // unreadable value: keep every section open
    }
  }, []);
  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  };

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
  // Trainer Admin is its own role (TRAINER_ADMIN), independent of the view mode.
  const isTrainerAdmin = hasTrainerAdminAccess(actualRoles);
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

  const isVisible = (item: NavItem): boolean => {
    // Trainer Admin follows its own role, in every view, the accountant view included
    // (People section for Trainer Admin holders, Alfred, 20 Nov 2026).
    if (item.trainerAdminOnly) return isTrainerAdmin;
    if (item.adminOnly && !isAdmin) return false;
    if (item.financeOnly && !canSeeFinance) return false;
    if (item.noAccountant && isAccountantView) return false;
    if (item.hideForIntern && isInternView) return false;
    if (item.internOnly && !isInternView && !(isAccountantView && item.allowAccountant)) return false;
    if (item.staffOnly && (isAdmin || (isAccountantView && !item.allowAccountant))) return false;
    return true;
  };

  return (
    <div className={cn("flex grow flex-col gap-y-5 pt-4", collapsed ? "px-2" : "px-6")}>
      {/* Logo + collapse toggle */}
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "flex-col gap-2" : "gap-3")}>
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center overflow-hidden shrink-0">
          {companyLogo ? (
            <Image src={companyLogo} alt="Logo" width={40} height={40} className="object-contain" unoptimized />
          ) : (
            <span className="text-lg font-bold text-on-color">HR</span>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white line-clamp-2 leading-tight">{companyShortName ?? "TIA HRMS"}</p>
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
          {navigationGroups.map((group, groupIndex) => {
            const items = group.items.filter(isVisible);
            if (items.length === 0) return null;
            const open = !group.label || collapsed || !closedGroups.includes(group.id);
            const holdsActive = items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
            return (
              <Fragment key={group.id}>
                {group.label && !collapsed && (
                  <li className="mt-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={open}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-gray-200",
                        // A folded section that holds the current page keeps a visible cue.
                        !open && holdsActive ? "text-primary" : "text-gray-500",
                      )}
                    >
                      <span>{group.label}</span>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                )}
                {group.label && collapsed && groupIndex > 0 && (
                  <li aria-hidden className="mx-2 my-1 border-t border-gray-800" />
                )}
                {open &&
                  items.map((item) => (
                    <TopLevelNavItem
                      key={`${item.name}:${item.href}`}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      isAdmin={isAdmin}
                    />
                  ))}
              </Fragment>
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
  // Children may be admin-gated (e.g. Upload CPF). Drop hidden ones up front so
  // the expand chevron disappears too when nothing is left to show.
  const visibleChildren = item.children?.filter((c) => !c.adminOnly || isAdmin);
  const children = visibleChildren && visibleChildren.length > 0 ? visibleChildren : undefined;
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
            ? "bg-primary text-on-color"
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
              // Inherit the row colour: white on the blue active fill, ink on the light "open group" fill.
              isActive ? "text-current" : "text-gray-400 group-hover:text-gray-200",
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
  // `exact` is for a child that points at its own parent's route (e.g. the
  // "Payroll" row under Payroll Management). Prefix matching would light it up
  // on every sibling route such as /payroll/generate.
  const childActive = child.exact
    ? pathname === child.href
    : pathname === child.href || pathname.startsWith(child.href + "/");
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  // route-driven default, overridable by user click
  const expanded = manuallyOpen ?? childActive;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center rounded-lg text-sm transition-all",
          childActive && !grandchildren
            ? "bg-primary text-on-color"
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
                  childActive ? "text-current" : "text-gray-500 group-hover:text-gray-200",
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
                      ? "bg-primary/80 text-on-color"
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
