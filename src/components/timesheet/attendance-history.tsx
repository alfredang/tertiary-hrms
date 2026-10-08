"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Sigma, CalendarCheck, AlertCircle } from "lucide-react";
import { formatDay, formatMonth, formatTime, shiftMonth, currentMonth } from "./attendance-format";

interface Punch {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hours: number | null;
}

interface HistoryData {
  month: string;
  employee: { id: string; name: string; employeeCode: string } | null;
  days: Punch[];
  totalHours: number;
  daysWorked: number;
}

/**
 * Daily clock-in/out history for one month with the month's total hours.
 * Without `employeeId` it shows the signed-in user's own history; admins pass
 * an employee id to inspect someone else's. `month` may be controlled by the
 * parent (admin overview) or left to the component.
 */
export function AttendanceHistory({
  employeeId,
  month: controlledMonth,
  onMonthChange,
  reloadKey = 0,
  title = "Daily history",
}: {
  employeeId?: string;
  month?: string;
  onMonthChange?: (month: string) => void;
  reloadKey?: number;
  title?: string;
}) {
  const [ownMonth, setOwnMonth] = useState(currentMonth);
  const month = controlledMonth ?? ownMonth;
  const setMonth = (m: string) => (onMonthChange ? onMonthChange(m) : setOwnMonth(m));

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ month });
    if (employeeId) qs.set("employeeId", employeeId);
    fetch(`/api/attendance/history?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body: HistoryData = await res.json();
        if (!cancelled) setData(body);
      })
      .catch(() => !cancelled && setError("Could not load attendance history."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month, employeeId, reloadKey]);

  const isCurrent = month >= currentMonth();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <Sigma className="h-5 w-5 text-emerald-400" />
          <p className="mt-2 text-3xl font-bold text-white">{loading || !data ? "—" : `${data.totalHours.toFixed(1)} h`}</p>
          <p className="text-sm text-gray-400">Total hours ({formatMonth(month)})</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <CalendarCheck className="h-5 w-5 text-blue-400" />
          <p className="mt-2 text-3xl font-bold text-white">{loading || !data ? "—" : data.daysWorked}</p>
          <p className="text-sm text-gray-400">Days worked</p>
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
      ) : data?.days.length ? (
        <div className="overflow-hidden rounded-2xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Check in</th>
                <th className="px-4 py-3 font-medium">Check out</th>
                <th className="px-4 py-3 text-right font-medium">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900/60">
              {data.days.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-white">{formatDay(p.date)}</td>
                  <td className="px-4 py-3 text-gray-300">{formatTime(p.clockIn)}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {p.clockOut ? formatTime(p.clockOut) : p.clockIn ? <span className="text-amber-400">Working…</span> : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                    {p.hours != null ? p.hours.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-900 text-white">
              <tr>
                <td className="px-4 py-3 font-semibold" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{data.totalHours.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
          No check-ins in {formatMonth(month)}.
        </p>
      )}
    </div>
  );
}
