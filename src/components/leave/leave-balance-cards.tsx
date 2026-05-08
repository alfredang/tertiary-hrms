"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Info } from "lucide-react";
import { computeYearlyEntitlement } from "@/lib/utils";

interface LeaveBalance {
  proRated: number;
  allocation: number;
  taken: number;
  rejected: number;
  carriedOver: number;
}

interface Props {
  leaveBalance: LeaveBalance;
  employeeStartDate: string | null;
  employeeEndDate?: string | null;
  monthlyLeaveRate?: number | null;
}

interface MonthRow {
  periodLabel: string;
  daysAccrued: number;
  cumulative: number;
  isFuture: boolean;
}

function buildClean(
  annualEntitlement: number,
  startDateStr: string | null,
  customLeaveRate?: number | null,
  contractEndDateStr?: string | null,
): MonthRow[] {
  const now = new Date();
  const currentYear = now.getFullYear();

  const startDate = startDateStr ? new Date(startDateStr) : null;
  const startedThisYear = startDate && startDate.getFullYear() === currentYear;

  // Short-contract mode: admin explicitly set leave < 6 days (contract < 6 months)
  const isShortContract = customLeaveRate != null && customLeaveRate < 6;

  // Fixed yearly entitlement for current year based on seniority at Jan 1
  const yearlyEntitlement = startDate
    ? computeYearlyEntitlement(startDate, currentYear)
    : annualEntitlement;

  const rows: MonthRow[] = [];
  let cumulative = 0;

  // Build period boundaries: rolling months from start (if started this year) or Jan–Dec
  const periods: Array<{ start: Date; end: Date }> = [];

  const contractEnd = contractEndDateStr ? new Date(contractEndDateStr) : null;

  if (startedThisYear && startDate) {
    // Show exactly the number of periods matching the contract length (capped at 12)
    const maxPeriods = customLeaveRate != null && customLeaveRate < 12 ? customLeaveRate : 12;
    let s = new Date(startDate);
    for (let i = 0; i < maxPeriods; i++) {
      const e = new Date(s);
      e.setMonth(e.getMonth() + 1);
      e.setDate(e.getDate() - 1);
      // Trim the last period's end to the actual contract end date
      const periodEnd = contractEnd && e > contractEnd ? contractEnd : e;
      periods.push({ start: new Date(s), end: periodEnd });
      s = new Date(s);
      s.setMonth(s.getMonth() + 1);
    }
  } else {
    for (let m = 0; m < 12; m++) {
      periods.push({ start: new Date(currentYear, m, 1), end: new Date(currentYear, m + 1, 0) });
    }
  }

  for (const { start, end } of periods) {
    const isFuture = start > now;
    const isPartial = !isFuture && end > now;

    let accrued = 0;
    if (!isFuture) {
      let perMonth = 0;
      if (isShortContract && customLeaveRate != null) {
        // Short contract: 1 day/month up to the admin-set total cap
        if (Math.round(cumulative) < customLeaveRate) {
          perMonth = 1;
        }
      } else {
        // Long contract, FT, or no rate set: accrue from month 1, no waiting period
        perMonth = yearlyEntitlement / 12;
      }

      if (isPartial) {
        const daysInPeriod = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
        const daysElapsed = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
        accrued = perMonth * Math.min(daysElapsed / daysInPeriod, 1);
      } else {
        accrued = perMonth;
      }
      cumulative += accrued;
    }

    const displayEnd = isPartial ? now : end;
    rows.push({
      periodLabel: formatPeriod(start, displayEnd),
      daysAccrued: Math.round(accrued * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      isFuture,
    });
  }

  return rows;
}

function formatPeriod(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${start.toLocaleDateString("en-SG", opts)} – ${end.toLocaleDateString("en-SG", opts)}`;
}

export function LeaveBalanceCards({ leaveBalance, employeeStartDate, employeeEndDate, monthlyLeaveRate }: Props) {
  const [open, setOpen] = useState(false);

  const rows = buildClean(leaveBalance.allocation, employeeStartDate, monthlyLeaveRate, employeeEndDate);
  const remaining = leaveBalance.proRated + leaveBalance.carriedOver - leaveBalance.taken;

  const isShortContract = monthlyLeaveRate != null && monthlyLeaveRate < 6;

  // For contract employees (monthlyLeaveRate < 12), total entitlement = their rate
  // For FT/senior (rate = 12 or null), use seniority-based entitlement
  const yearlyEntitlement =
    monthlyLeaveRate != null && monthlyLeaveRate < 12
      ? monthlyLeaveRate
      : employeeStartDate
      ? computeYearlyEntitlement(new Date(employeeStartDate))
      : leaveBalance.allocation;

  // Distinguish advance AL (within entitlement, amber) from true deficit (beyond entitlement, red)
  const advanceAl = remaining < 0 && leaveBalance.taken <= yearlyEntitlement + leaveBalance.carriedOver;
  const trueDeficit = remaining < 0 && leaveBalance.taken > yearlyEntitlement + leaveBalance.carriedOver;
  const remainingColor = remaining < 0
    ? (trueDeficit ? "text-red-400" : "text-amber-400")
    : "text-green-400";
  const remainingLabel = remaining < 0
    ? (trueDeficit ? "Remaining (Deficit)" : "Remaining (Advance)")
    : "Remaining Balance";

  const cards = [
    { label: remainingLabel, value: remaining, color: remainingColor, clickable: true },
    { label: "Earned to Date", value: leaveBalance.proRated, color: "text-cyan-400", clickable: true },
    { label: "Yearly Entitlement", value: yearlyEntitlement, color: "text-blue-400", clickable: false },
    { label: "Leave(s) Taken", value: leaveBalance.taken, color: "text-amber-400", clickable: false },
    { label: "Leave(s) Rejected", value: leaveBalance.rejected, color: "text-red-400", clickable: false },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            onClick={card.clickable ? () => setOpen(true) : undefined}
            className={`bg-gray-950 border border-gray-800 rounded-xl p-3 sm:p-4 transition-colors ${
              card.clickable ? "cursor-pointer hover:border-gray-600 hover:bg-gray-900 group" : ""
            }`}
          >
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              {card.label}
              {card.clickable && (
                <Info className="h-3 w-3 text-gray-600 group-hover:text-gray-400 transition-colors" />
              )}
            </p>
            <p className={`text-xl sm:text-2xl font-bold ${card.color}`}>{card.value}</p>
            {card.clickable && (
              <p className="text-xs text-gray-600 group-hover:text-gray-500 mt-1 transition-colors">
                Click for monthly breakdown
              </p>
            )}
          </div>
        ))}
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg max-h-[85vh] overflow-y-auto bg-gray-950 border border-gray-800 rounded-xl p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <DialogPrimitive.Title className="text-base font-semibold text-white flex items-center gap-2">
                Annual Leave Accrual Breakdown
                <span className="text-xs font-normal text-gray-400">({new Date().getFullYear()})</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="text-gray-400 hover:text-white transition-colors rounded-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="space-y-3">
              {/* Summary */}
              <div className="bg-gray-900 rounded-lg p-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-gray-400">Entitlement</p>
                  <p className="text-white font-bold text-base">{yearlyEntitlement} days/yr</p>
                </div>
                <div>
                  <p className="text-gray-400">Earned to Date</p>
                  <p className="text-cyan-400 font-bold text-base">{leaveBalance.proRated} days</p>
                </div>
                <div>
                  <p className="text-gray-400">{remaining < 0 ? (trueDeficit ? "Deficit" : "Advance") : "Remaining"}</p>
                  <p className={`font-bold text-base ${remainingColor}`}>{remaining} days</p>
                </div>
              </div>

              {/* Monthly table */}
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900 border-b border-gray-800">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Period</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Accrued</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Running Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className={row.isFuture ? "text-gray-600" : "text-gray-200"}
                      >
                        <td className="px-3 py-2">
                          {row.periodLabel}
                          {row.isFuture && <span className="ml-1 text-gray-700">(upcoming)</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.isFuture ? "—" : `+${row.daysAccrued.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.isFuture ? "—" : (
                            <span className={Math.abs(row.cumulative - leaveBalance.proRated) < 0.01 ? "text-cyan-400 font-semibold" : ""}>
                              {row.cumulative.toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-600">
                {isShortContract
                  ? `Short contract: ${yearlyEntitlement} day${yearlyEntitlement !== 1 ? "s" : ""} total, accruing at 1 day/month.`
                  : `Rate: 1 day/month, accumulates from your first month of service.`}
              </p>
              {advanceAl && (
                <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-2.5 text-xs text-amber-300">
                  You have used days in advance of monthly accrual. Your balance will normalise as you continue earning leave each month.
                </div>
              )}
              {trueDeficit && (
                <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-2.5 text-xs text-red-300">
                  Your leave usage has exceeded your full entitlement. The deficit will be offset by future OT earnings.
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
