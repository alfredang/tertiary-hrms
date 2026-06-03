"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertCircle, Clock, Users, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

interface OilEntry {
  id: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  dayName: string;
  isPublicHoliday: boolean;
  hours: number;
  otCredited: number;
  status: string;
  adminComment: string | null;
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
  const [oilEntries, setOilEntries] = useState<OilEntry[]>([]);
  const [oilLoading, setOilLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [commentId, setCommentId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const { toast } = useToast();

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

  const fetchOilEntries = useCallback(async () => {
    setOilLoading(true);
    try {
      const res = await fetch("/api/timesheet/admin");
      const d: OilEntry[] = await res.json();
      setOilEntries(d);
    } finally {
      setOilLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(weekStart); }, [weekStart, fetchData]);
  useEffect(() => { fetchOilEntries(); }, [fetchOilEntries]);

  const handleAction = async (entryId: string, action: "APPROVE" | "REJECT") => {
    setActioningId(entryId);
    try {
      const res = await fetch("/api/timesheet/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, action, comment: comment.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({
        title: action === "APPROVE" ? "Approved" : "Rejected",
        description: action === "APPROVE" ? "Off In Lieu days credited to employee." : "Submission rejected.",
      });
      setCommentId(null);
      setComment("");
      fetchOilEntries();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setActioningId(null);
    }
  };

  const isCurrentWeek = weekStart === currentWeekStart;

  const filteredRows = data?.rows.filter((r) =>
    filterStatus === "all" ? true : r.status === filterStatus,
  ) ?? [];

  const pendingOil = oilEntries.filter((e) => e.status === "PENDING");
  const recentOil  = oilEntries.filter((e) => e.status !== "PENDING").slice(0, 10);

  return (
    <div className="space-y-8">

      {/* Off In Lieu Approvals */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-white">Off In Lieu Approvals</h3>
          {pendingOil.length > 0 && (
            <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-700/50 rounded-full px-2 py-0.5">
              {pendingOil.length} pending
            </span>
          )}
        </div>

        {oilLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : pendingOil.length === 0 && recentOil.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center text-gray-500 text-sm">
            No weekend/public holiday submissions yet.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Employee</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Hours</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Off In Lieu</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[...pendingOil, ...recentOil].map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{entry.employeeName}</p>
                      <p className="text-[10px] text-gray-500">{entry.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      <span>{entry.dayName}, {entry.date}</span>
                      {entry.isPublicHoliday && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded border text-amber-400 bg-amber-950/30 border-amber-800/40">PH</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{entry.hours}h</td>
                    <td className="px-4 py-3 text-emerald-400 font-semibold">+{entry.otCredited}d</td>
                    <td className="px-4 py-3">
                      {entry.status === "PENDING" ? (
                        <span className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded px-2 py-0.5">Pending</span>
                      ) : entry.status === "APPROVED" ? (
                        <div>
                          <span className="text-xs text-green-400 bg-green-950/30 border border-green-800/50 rounded px-2 py-0.5">Approved</span>
                          {entry.adminComment && <p className="text-[10px] text-gray-500 mt-0.5">{entry.adminComment}</p>}
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs text-red-400 bg-red-950/30 border border-red-800/50 rounded px-2 py-0.5">Rejected</span>
                          {entry.adminComment && <p className="text-[10px] text-gray-500 mt-0.5">{entry.adminComment}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === "PENDING" && (
                        commentId === entry.id ? (
                          <div className="flex flex-col gap-1.5 min-w-[200px]">
                            <textarea
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Comment (optional)..."
                              rows={2}
                              className="text-xs rounded bg-gray-900 border border-gray-700 text-white px-2 py-1 resize-none w-full"
                            />
                            <div className="flex gap-1.5">
                              <Button size="sm" onClick={() => handleAction(entry.id, "APPROVE")} disabled={actioningId === entry.id}
                                className="h-6 px-2 text-xs bg-green-700 hover:bg-green-600 text-white">
                                <Check className="h-3 w-3 mr-1" />{actioningId === entry.id ? "..." : "Approve"}
                              </Button>
                              <Button size="sm" onClick={() => handleAction(entry.id, "REJECT")} disabled={actioningId === entry.id}
                                className="h-6 px-2 text-xs bg-red-800 hover:bg-red-700 text-white">
                                <X className="h-3 w-3 mr-1" />{actioningId === entry.id ? "..." : "Reject"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setCommentId(null); setComment(""); }}
                                className="h-6 px-2 text-xs text-gray-400">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline"
                              onClick={() => { setCommentId(entry.id); setComment(""); }}
                              className="h-7 px-2 text-xs border-gray-700 text-gray-300 hover:text-white">
                              Review
                            </Button>
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weekly overview */}
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
    </div>
  );
}
