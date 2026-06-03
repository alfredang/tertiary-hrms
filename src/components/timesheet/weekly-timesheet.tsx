"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Save, Loader2, Clock, Sun, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DayEntry {
  date: string;
  dayName: string;
  isWeekend: boolean;
  isPublicHoliday: boolean;
  phName: string | null;
  isNonWorkDay: boolean;
  hours: number;
  otCredited: number;
  status: string | null;
  adminComment: string | null;
  isSubmittable: boolean;
}

interface WeekData {
  weekStart: string;
  isLocked: boolean;
  days: DayEntry[];
}

function getMonday(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return mon.toISOString().slice(0, 10);
}

function addWeeks(dateStr: string, n: number): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day + n * 7));
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end   = new Date(Date.UTC(y, m - 1, d + 6));
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-SG", opts)} – ${end.toLocaleDateString("en-SG", opts)}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

function otForHours(hours: number): number {
  if (hours >= 8) return 1;
  if (hours >= 4) return 0.5;
  return 0;
}

const HOUR_OPTIONS = [
  { value: 0,  label: "Off",        short: "—" },
  { value: 4,  label: "4h (Half)",  short: "4h" },
  { value: 8,  label: "8h (Full)",  short: "8h" },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING:  { label: "Pending approval", className: "text-amber-400 bg-amber-950/30 border-amber-800/50" },
  APPROVED: { label: "Approved",         className: "text-green-400 bg-green-950/30 border-green-800/50" },
  REJECTED: { label: "Rejected",         className: "text-red-400 bg-red-950/30 border-red-800/50" },
};

export function WeeklyTimesheet() {
  const currentWeekStart = getMonday(new Date());

  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [data, setData] = useState<WeekData | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchWeek = useCallback(async (ws: string) => {
    setLoading(true);
    setSavedMsg("");
    try {
      const res = await fetch(`/api/timesheet?weekStart=${ws}`);
      const d: WeekData = await res.json();
      setData(d);
      const initial: Record<string, number> = {};
      for (const day of d.days) {
        if (day.isNonWorkDay) initial[day.date] = day.hours;
      }
      setDraft(initial);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWeek(weekStart); }, [weekStart, fetchWeek]);

  const goToPrev = () => setWeekStart((ws) => addWeeks(ws, -1));
  const goToNext = () => {
    const next = addWeeks(weekStart, 1);
    if (next <= currentWeekStart) setWeekStart(next);
  };
  const goToCurrent = () => setWeekStart(currentWeekStart);

  const isCurrentWeek = weekStart === currentWeekStart;
  const isFutureWeek = weekStart > currentWeekStart;

  // Only non-workdays that are submittable (open window + current week)
  const submittableDays = data?.days.filter((d) => d.isNonWorkDay && d.isSubmittable) ?? [];
  const nonWorkDays = data?.days.filter((d) => d.isNonWorkDay) ?? [];

  const doSave = async () => {
    if (!data) return;
    setShowConfirm(false);
    setSaving(true);
    setSavedMsg("");
    try {
      const entriesToSave = submittableDays
        .filter((day) => (draft[day.date] ?? 0) > 0)
        .map((day) => ({ date: day.date, hours: draft[day.date] ?? 0 }));

      if (entriesToSave.length === 0) {
        setSavedMsg("No hours to submit.");
        return;
      }

      const res = await fetch("/api/timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, entries: entriesToSave }),
      });
      const json = await res.json();
      if (res.ok) {
        setSavedMsg("Submitted for admin approval.");
        await fetchWeek(weekStart);
      } else {
        setSavedMsg(json.error ?? "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  };

  const otPreview = submittableDays.reduce((sum, day) => {
    return sum + otForHours(draft[day.date] ?? 0);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold text-base">Submit for approval?</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Your hours will be sent to admin for review. Off In Lieu days will be credited once approved.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>Go Back</Button>
              <Button size="sm" onClick={doSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-white min-w-[220px] text-center">
            {weekStart ? formatWeekRange(weekStart) : "—"}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToNext}
            disabled={isCurrentWeek || isFutureWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentWeek && (
          <Button variant="ghost" size="sm" onClick={goToCurrent} className="text-xs text-primary">
            Jump to current week
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : data ? (
        <>
          {nonWorkDays.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center text-gray-500">
              <p className="text-sm">No weekends or public holidays this week.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <div className="grid grid-cols-[80px_1fr_160px_120px_auto] gap-3 bg-gray-900 border-b border-gray-800 px-4 py-2.5">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Day</p>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Date</p>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Hours</p>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Off In Lieu</p>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Status</p>
              </div>

              {nonWorkDays.map((day) => {
                const hours = draft[day.date] ?? day.hours;
                const earned = otForHours(hours);
                const now = new Date();
                const todayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
                const isToday = day.date === todayKey;
                const statusBadge = day.status ? STATUS_BADGE[day.status] : null;

                return (
                  <div
                    key={day.date}
                    className={`grid grid-cols-[80px_1fr_160px_120px_auto] items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0 transition-colors
                      ${day.isPublicHoliday ? "bg-amber-950/10" : "bg-emerald-950/10"}
                      ${isToday ? "border-l-2 border-l-primary" : ""}
                    `}
                  >
                    {/* Day name */}
                    <div>
                      <span className={`text-sm font-semibold ${day.isPublicHoliday ? "text-amber-400" : "text-emerald-400"}`}>
                        {day.dayName}
                      </span>
                      {isToday && (
                        <span className="ml-1.5 text-[10px] bg-primary/20 text-primary rounded px-1 py-0.5">Today</span>
                      )}
                    </div>

                    {/* Date + type badge */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-gray-300">{formatDateLabel(day.date)}</span>
                      {day.isPublicHoliday && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-950/30 border-amber-800/40 truncate max-w-[140px]">
                          PH: {day.phName}
                        </span>
                      )}
                      {!day.isPublicHoliday && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-emerald-400 bg-emerald-950/30 border-emerald-800/40">
                          Weekend
                        </span>
                      )}
                    </div>

                    {/* Hours selector */}
                    {day.isSubmittable && day.status !== "APPROVED" ? (
                      <div className="flex gap-1.5">
                        {HOUR_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDraft((prev) => ({ ...prev, [day.date]: opt.value }))}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer
                              ${hours === opt.value
                                ? opt.value === 0 ? "bg-gray-700 text-gray-300" : "bg-emerald-600 text-white"
                                : "bg-gray-900 border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                              }
                            `}
                          >
                            {opt.short}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`text-sm font-semibold ${hours === 0 ? "text-gray-600" : "text-emerald-400"}`}>
                        {hours === 0 ? "—" : `${hours}h`}
                      </span>
                    )}

                    {/* Off In Lieu earned */}
                    <div>
                      {earned > 0 ? (
                        <span className="text-xs font-semibold text-emerald-400">+{earned}d</span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="min-w-[120px]">
                      {statusBadge ? (
                        <div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                          {day.adminComment && (
                            <p className="text-[10px] text-gray-500 mt-0.5">{day.adminComment}</p>
                          )}
                        </div>
                      ) : day.isSubmittable ? (
                        <span className="text-[10px] text-gray-600">Not submitted</span>
                      ) : (
                        <span className="text-[10px] text-gray-700">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit bar */}
          {submittableDays.length > 0 && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 text-sm">
                {otPreview > 0 && (
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Sun className="h-4 w-4" />
                    <span>If approved: <span className="font-semibold">+{otPreview} Off In Lieu day{otPreview !== 1 ? "s" : ""}</span></span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {savedMsg && (
                  <span className={`text-xs ${savedMsg.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>
                    {savedMsg}
                  </span>
                )}
                <Button
                  onClick={() => setShowConfirm(true)}
                  disabled={saving || submittableDays.every((d) => (draft[d.date] ?? 0) === 0)}
                  size="sm"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Submit for Approval
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600">
            Log hours worked on weekends and public holidays. Submit by 11:30 PM SGT. Off In Lieu days are credited after admin approval.
          </p>
        </>
      ) : null}
    </div>
  );
}
