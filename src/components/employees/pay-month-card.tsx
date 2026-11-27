"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange } from "lucide-react";
import type { PayMonthSummary } from "@/lib/pay-month-summary";

// Local copy: the summary module loads Prisma, so only its type is imported here.
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/**
 * The month's figures for working out this person's pay (Alfred, 26 Nov 2026), with a month filter:
 * Annual Leave, No Pay Leave, MC ("No Pay MC" for interns, "Paid MC" for staff) and Payback (off days
 * worked). Figures from `GET /api/employees/{id}/pay-month`, counted the way the payslip counts them.
 */
export function PayMonthCard({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(monthKey(now.getFullYear(), now.getMonth() + 1));
  const [data, setData] = useState<PayMonthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/employees/${employeeId}/pay-month?month=${month}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<PayMonthSummary>;
      })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load"));
    return () => {
      live = false;
    };
  }, [employeeId, month]);

  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  const loading = !data || data.month !== month;
  const tiles = data
    ? [
        { label: "Annual Leave", value: data.annualLeaveDays, hint: "Paid", color: "#f59e0b" },
        { label: "No Pay Leave", value: data.noPayLeaveDays, hint: "Deducted", color: "#64748b" },
        { label: data.mcLabel, value: data.mcDays, hint: data.mcPaid ? "Paid" : "Deducted", color: "#ec4899" },
        { label: "Payback", value: data.paybackDays, hint: "Off days worked, added back", color: "#10b981" },
      ]
    : [];

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-white">
          <CalendarRange className="h-5 w-5" />
          Month for Pay
        </CardTitle>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          Month
          <input
            type="month"
            value={month}
            max={monthKey(now.getFullYear() + 1, 12)}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1 text-sm text-white"
            aria-label="Month"
          />
        </label>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${loading ? "opacity-50" : ""}`}>
            {(tiles.length ? tiles : [1, 2, 3, 4].map((i) => ({ label: "…".repeat(i), value: 0, hint: "", color: "#6b7280" }))).map((t) => (
              <div key={t.label} className="rounded-xl border border-gray-800 p-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                  {t.label}
                </div>
                <div className="mt-1 text-xl font-semibold text-white">{tiles.length ? days(t.value) : "—"}</div>
                <div className="text-xs text-gray-500">{t.hint}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
