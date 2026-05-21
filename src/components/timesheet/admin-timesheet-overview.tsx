"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertCircle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DayHeader {
  date: string;
  dayName: string;
  isWeekend: boolean;
  isPublicHoliday: boolean;
}

interface DayStatus {
  date: string;
  hours: number | null;
  onLeave: string | null;
  isWeekend: boolean;
  isHoliday: boolean;
}

interface EmployeeRow {
  id: string;
  name: string;
  employmentType: string;
  days: DayStatus[];
  totalHours: number;
  submittedWorkdays: number;
  missingWorkdays: number;
  totalWorkdays: number;
  status: "complete" | "partial" | "missing" | "na";
}

interface OverviewData {
  weekStart: string;
  currentWeekStart: string;
  todayKey: string | null;
  dayHeaders: DayHeader[];
  rows: EmployeeRow[];
  summary: { total: number; complete: number; partial: number; missing: number };
}

function addWeeks(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n * 7)).toISOString().slice(0, 10);
}

function getMonday(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
    .toISOString()
    .slice(0, 10);
}

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-SG", opts)} – ${end.toLocaleDateString("en-SG", opts)}`;
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
}

function HoursCell({ day, todayKey }: { day: DayStatus; todayKey: string | null }) {
  const isToday = day.date === todayKey;

  if (day.isWeekend || day.isHoliday) {
    return (
      <span className="text-xs text-gray-700 font-medium">
        {day.isHoliday ? "PH" : "—"}
      </span>
    );
  }
  if (day.onLeave) {
    return (
      <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border text-purple-400 bg-purple-950/30 border-purple-800/40 leading-tight">
        Leave
      </span>
    );
  }
  if (day.hours === null) {
    // Future day — no expectation yet
    if (!isToday && day.date > (todayKey ?? "")) {
      return <span className="text-xs text-gray-700">—</span>;
    }
    // Past or today with no entry
    return (
      <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border text-red-400 bg-red-950/30 border-red-800/40 leading-tight">
        Missing
      </span>
    );
  }
  if (day.hours === 0) {
    return <span className="text-xs text-gray-500">0h</span>;
  }
  return (
    <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-white"}`}>
      {day.hours}h
    </span>
  );
}

function StatusBadge({ status }: { status: EmployeeRow["status"] }) {
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
        <Clock className="h-3 w-3" /> Partial
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400">
        <AlertCircle className="h-3 w-3" /> Missing
      </span>
    );
  }
  return <span className="text-xs text-gray-600">—</span>;
}

export function AdminTimesheetOverview() {
  const currentWeekStart = getMonday(new Date());
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "missing" | "partial" | "complete">("all");

  const fetchData = useCallback(async (ws: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/timesheet/admin-overview?weekStart=${ws}`);
      const d: OverviewData = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(weekStart); }, [weekStart, fetchData]);

  const isCurrentWeek = weekStart === currentWeekStart;

  const filteredRows = data?.rows.filter((r) =>
    filterStatus === "all" ? true : r.status === filterStatus,
  ) ?? [];

  return (
    <div className="space-y-5">
      {/* Week nav + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((ws) => addWeeks(ws, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-white min-w-[220px] text-center">
            {weekStart ? formatWeekRange(weekStart) : "—"}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekStart((ws) => addWeeks(ws, 1))}
            disabled={isCurrentWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(currentWeekStart)} className="text-xs text-primary">
              Current week
            </Button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          {(["all", "missing", "partial", "complete"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize
                ${filterStatus === f
                  ? f === "missing" ? "bg-red-900/60 text-red-300 border border-red-700"
                  : f === "partial" ? "bg-amber-900/60 text-amber-300 border border-amber-700"
                  : f === "complete" ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700"
                  : "bg-gray-700 text-white border border-gray-600"
                  : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-600"
                }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              {data && f !== "all" && (
                <span className="ml-1 opacity-70">
                  ({f === "missing" ? data.summary.missing : f === "partial" ? data.summary.partial : data.summary.complete})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Users className="h-3.5 w-3.5" /> Total employees
            </div>
            <p className="text-2xl font-bold text-white">{data.summary.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </div>
            <p className="text-2xl font-bold text-emerald-400">{data.summary.complete}</p>
          </div>
          <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs mb-1">
              <Clock className="h-3.5 w-3.5" /> Partial
            </div>
            <p className="text-2xl font-bold text-amber-400">{data.summary.partial}</p>
          </div>
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3">
            <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
              <AlertCircle className="h-3.5 w-3.5" /> Missing
            </div>
            <p className="text-2xl font-bold text-red-400">{data.summary.missing}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : data ? (
        <div className="rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wide w-40">
                  Employee
                </th>
                {data.dayHeaders.map((h) => (
                  <th
                    key={h.date}
                    className={`text-center px-2 py-3 text-xs font-medium uppercase tracking-wide min-w-[64px]
                      ${h.isWeekend || h.isPublicHoliday ? "text-gray-600" : "text-gray-500"}
                      ${h.date === data.todayKey ? "text-primary" : ""}
                    `}
                  >
                    <div>{h.dayName}</div>
                    <div className="text-[10px] font-normal mt-0.5 opacity-70">{formatShortDate(h.date)}</div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Total
                </th>
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500 text-sm">
                    No employees match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium text-sm truncate max-w-[140px]">{row.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 capitalize">
                        {row.employmentType?.toLowerCase().replace("_", " ")}
                      </p>
                    </td>
                    {row.days.map((day) => (
                      <td
                        key={day.date}
                        className={`text-center px-2 py-3
                          ${day.isWeekend || day.isHoliday ? "bg-gray-900/30" : ""}
                          ${day.date === data.todayKey ? "bg-primary/5" : ""}
                        `}
                      >
                        <HoursCell day={day} todayKey={data.todayKey} />
                      </td>
                    ))}
                    <td className="text-center px-3 py-3">
                      <span className="text-sm font-semibold text-white">
                        {row.totalHours > 0 ? `${row.totalHours}h` : "—"}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-gray-600">
        Compliance is measured against workdays up to and including today. Future days are not counted. Weekends and public holidays are excluded.
      </p>
    </div>
  );
}
