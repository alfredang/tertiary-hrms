"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Users, Sigma, AlertCircle, X } from "lucide-react";
import { AttendanceHistory } from "./attendance-history";
import { formatDay, formatMonth, shiftMonth, currentMonth } from "./attendance-format";

interface SummaryRow {
  id: string;
  name: string;
  employeeCode: string;
  isIntern: boolean;
  daysWorked: number;
  totalHours: number;
  lastPunchDate: string | null;
  clockedInNow: boolean;
}

interface SummaryData {
  month: string;
  employees: SummaryRow[];
  totalHours: number;
}

/**
 * Admin roll-up of intern check-ins: one row per intern with the month's
 * days worked and total hours; selecting a row opens that intern's daily
 * check-in / check-out history for the same month.
 */
export function AdminAttendanceOverview() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SummaryRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/attendance/summary?month=${month}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body: SummaryData = await res.json();
        if (!cancelled) setData(body);
      })
      .catch(() => !cancelled && setError("Could not load attendance summary."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const isCurrent = month >= currentMonth();
  const rows = data?.employees ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-4 sm:max-w-md">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <Users className="h-5 w-5 text-blue-400" />
            <p className="mt-2 text-2xl font-bold text-white">{rows.length}</p>
            <p className="text-xs text-gray-400">People tracked</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <Sigma className="h-5 w-5 text-emerald-400" />
            <p className="mt-2 text-2xl font-bold text-white">{(data?.totalHours ?? 0).toFixed(1)} h</p>
            <p className="text-xs text-gray-400">Total hours</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-800 bg-gray-900/60 p-1">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium text-white">{formatMonth(month)}</span>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={isCurrent}
            aria-label="Next month"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/60 py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-8 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      ) : rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-gray-800">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Days worked</th>
                <th className="px-4 py-3 text-right font-medium">Total hours</th>
                <th className="px-4 py-3 font-medium">Last check-in</th>
                <th className="px-4 py-3 font-medium">Today</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900/60">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`cursor-pointer transition hover:bg-gray-800/60 ${selected?.id === r.id ? "bg-gray-800/80" : ""}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{r.name}</p>
                    <p className="text-xs text-gray-500">
                      {r.employeeCode}
                      {!r.isIntern && " · non-intern"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-300">{r.daysWorked}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">{r.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-300">{r.lastPunchDate ? formatDay(r.lastPunchDate) : "—"}</td>
                  <td className="px-4 py-3">
                    {r.clockedInNow ? (
                      <span className="rounded-full border border-amber-800/50 bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                        Working
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
          No interns or check-ins for {formatMonth(month)}.
        </p>
      )}

      {selected && (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4 sm:p-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm text-gray-400">
              {selected.name} · {selected.employeeCode}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close history"
              className="rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <AttendanceHistory
            employeeId={selected.id}
            month={month}
            onMonthChange={setMonth}
            title={`${selected.name}'s daily history`}
          />
        </div>
      )}
    </div>
  );
}
