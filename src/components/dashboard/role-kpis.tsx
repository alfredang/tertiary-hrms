import { Receipt, TrendingUp, TrendingDown, BookUser, BadgeCheck, UserRound } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { FinanceKpis, TrainerKpis } from "@/lib/dashboard-kpis";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";

/** Accountant view: claims waiting, then this month's bank income and expenses (Alfred, 20 Nov 2026). */
export function FinanceKpiRow(d: FinanceKpis) {
  return (
    <KpiTiles
      tiles={[
        {
          label: "Pending expense claims", value: String(d.pendingClaims),
          sub: d.pendingClaims ? `${formatCurrency(d.pendingClaimsAmount)} waiting for approval` : "Nothing waiting",
          href: "/expenses", icon: Receipt, attention: d.pendingClaims > 0,
        },
        {
          label: `Income, ${d.monthLabel}`, value: formatCurrency(d.incomeMonth),
          sub: `${formatCurrency(d.incomeYtd)} in ${d.year} so far`, href: "/accounting/income-tracking", icon: TrendingUp,
        },
        {
          label: `Expenses, ${d.monthLabel}`, value: formatCurrency(d.expensesMonth),
          sub: `${formatCurrency(d.expensesYtd)} in ${d.year} so far`, href: "/accounting/expense-tracking", icon: TrendingDown,
        },
      ]}
    />
  );
}

/** Trainer Admins: the same three counts as the tiles on /trainers, each opening that filter. */
export function TrainerKpiRow({ total, aclp, nonAclp, title }: TrainerKpis & { title?: string }) {
  return (
    <KpiTiles
      title={title}
      tiles={[
        { label: "Trainers", value: String(total), sub: "All trainers on record", href: "/trainers?aclp=all", icon: BookUser },
        { label: "ACLP trainers", value: String(aclp), sub: "Hold the ACLP", href: "/trainers", icon: BadgeCheck },
        { label: "Non-ACLP trainers", value: String(nonAclp), sub: "No ACLP on record", href: "/trainers?aclp=non", icon: UserRound },
      ]}
    />
  );
}
