import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PaySummary } from "@/lib/pay-summary";

/**
 * The person's latest payslip at a glance (admin view): gross pay, CPF employee / employer
 * (interns: no CPF), unpaid leave and paybacks, and take-home pay.
 */
export function LatestPayslipCard({ summary, intern }: { summary?: PaySummary; intern: boolean }) {
  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={strong ? "font-semibold text-white" : "text-gray-200"}>{value}</span>
    </div>
  );
  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Receipt className="h-5 w-5" />
          Latest Payslip{summary ? ` · ${summary.month}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!summary ? (
          <p className="text-sm text-gray-400">No payslip yet.</p>
        ) : (
          <>
            {row("Gross Pay", formatCurrency(summary.gross))}
            {summary.paybackDays > 0 && row("  incl. payback (off days worked)", `${summary.paybackDays} day${summary.paybackDays === 1 ? "" : "s"}`)}
            {summary.unpaidLeaveDays > 0 &&
              row(intern ? "MC / No Pay Leave deducted" : "No Pay Leave deducted", `${summary.unpaidLeaveDays} day${summary.unpaidLeaveDays === 1 ? "" : "s"}`)}
            {intern ? (
              row("CPF", "None (interns have no CPF)")
            ) : (
              <>
                {row("CPF (Employee)", formatCurrency(summary.cpfEmployee))}
                {row("CPF (Employer)", formatCurrency(summary.cpfEmployer))}
                {row("Total CPF", formatCurrency(summary.cpfEmployee + summary.cpfEmployer))}
              </>
            )}
            <div className="border-t border-gray-800 pt-2">{row("Take-Home Pay", formatCurrency(summary.takeHome), true)}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
