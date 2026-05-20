"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Save, Loader2, Lock, Clock, Sun, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DayEntry {
  date: string;
  dayName: string;
  isWeekend: boolean;
  isPublicHoliday: boolean;
  phName: string | null;
  isOnLeave: boolean;
  hours: number;
  otCredited: number;
  isEditable: boolean;
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

export function WeeklyTimesheet() {
  const currentWeekStart = getMonday(new Date());

  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [data, setData] = useState<WeekData | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchWeek = useCallback(async (ws: string) => {
    setLoading(true);
    setSavedMsg("");
    try {
      const res = await fetch(`/api/timesheet?weekStart=${ws}`);
      const d: WeekData = await res.json();
      setData(d);
      const initial: Record<string, number> = {};
      for (const day of d.days) initial[day.date] = day.hours;
      setDraft(initial);
      const hasEntries = d.days.some((day) => day.hours > 0);
      setIsEditing(!hasEntries && !d.isLocked);
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

  const doSave = async () => {
    if (!data || data.isLocked) return;
    setShowConfirm(false);
    setSaving(true);
    setSavedMsg("");
    try {
      const res = await fetch("/api/timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          entries: Object.entries(draft).map(([date, hours]) => ({ date, hours })),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const earned = json.otEarned as number;
        const deducted = json.absenceDeducted as number;
        let msg = "Timesheet saved.";
        if (earned > 0) msg = `Saved! +${earned} OT day${earned !== 1 ? "s" : ""} credited.`;
        else if (earned < 0) msg = `Saved. OT adjusted by ${earned} day${earned !== -1 ? "s" : ""}.`;
        if (deducted > 0) msg += ` ${deducted} OT day${deducted !== 1 ? "s" : ""} deducted for absence.`;
        setSavedMsg(msg);
        setIsEditing(false);
        await fetchWeek(weekStart);
      } else {
        setSavedMsg(json.error ?? "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  };

  // OT preview for current draft
  const otPreview = data
    ? data.days.reduce((sum, day) => {
        const hours = draft[day.date] ?? 0;
        if (day.isWeekend || day.isPublicHoliday) return sum + otForHours(hours);
        return sum;
      }, 0)
    : 0;

  const totalHours = Object.values(draft).reduce((s, h) => s + h, 0);

  return (
    <div className="space-y-5">
      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold text-base">Save timesheet?</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Once saved, <strong className="text-white">you will not be able to edit today&apos;s entry again</strong> after 10:00 PM SGT. Please make sure your hours are correct before confirming.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
                Go Back
              </Button>
              <Button size="sm" onClick={doSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Confirm &amp; Save
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
        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={goToCurrent} className="text-xs text-primary">
              Jump to current week
            </Button>
          )}
          {data && !data.isLocked && !isEditing && data.days.some((d) => d.isEditable) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setIsEditing(true); setSavedMsg(""); }}
              className="text-xs"
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Lock notice */}
      {data?.isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-400">
          <Lock className="h-4 w-4 shrink-0" />
          This week is locked. You can no longer edit past timesheets.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : data ? (
        <>
          {/* Day rows */}
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[80px_1fr_200px_100px] gap-0 bg-gray-900 border-b border-gray-800 px-4 py-2.5">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Day</p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide hidden sm:block">Date</p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Hours</p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide text-right hidden sm:block">OT</p>
            </div>

            {data.days.map((day) => {
              const hours = draft[day.date] ?? 0;
              const isOtDay = day.isWeekend || day.isPublicHoliday;
              const otEarned = isOtDay ? otForHours(hours) : 0;
              const now = new Date();
              const todayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
              const isToday = day.date === todayKey;

              return (
                <div
                  key={day.date}
                  className={`grid grid-cols-[80px_1fr_auto] sm:grid-cols-[80px_1fr_200px_100px] items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0 transition-colors
                    ${isOtDay ? "bg-emerald-950/10" : ""}
                    ${isToday ? "bg-primary/5 border-l-2 border-l-primary" : ""}
                  `}
                >
                  {/* Day name */}
                  <div>
                    <span className={`text-sm font-semibold ${isOtDay ? "text-emerald-400" : "text-white"}`}>
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
                      <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-950/30 border-amber-800/40 truncate max-w-[140px]">
                        PH: {day.phName}
                      </span>
                    )}
                    {!day.isPublicHoliday && day.isWeekend && (
                      <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded border text-blue-400 bg-blue-950/30 border-blue-800/40">
                        Weekend
                      </span>
                    )}
                    {day.isOnLeave && (
                      <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded border text-purple-400 bg-purple-950/30 border-purple-800/40">
                        On Leave
                      </span>
                    )}
                  </div>

                  {/* Hours — edit buttons only for editable days, read-only otherwise */}
                  {isEditing && day.isEditable ? (
                    <div className="flex gap-1.5">
                      {HOUR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, [day.date]: opt.value }))}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer
                            ${hours === opt.value
                              ? opt.value === 0
                                ? "bg-gray-700 text-gray-300"
                                : isOtDay
                                ? "bg-emerald-600 text-white"
                                : "bg-primary text-white"
                              : "bg-gray-900 border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                            }
                          `}
                        >
                          {opt.short}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 group"
                      onDoubleClick={() => { if (day.isEditable) setIsEditing(true); }}
                      title={
                        day.isOnLeave
                          ? "Auto-set to 0 hours (on approved leave)"
                          : day.isEditable
                          ? "Double-click to edit"
                          : "Editable between 11:30 AM – 10:00 PM SGT"
                      }
                    >
                      <span className={`text-sm font-semibold min-w-[32px]
                        ${day.isOnLeave ? "text-purple-500" : hours === 0 ? "text-gray-600" : isOtDay ? "text-emerald-400" : "text-white"}
                      `}>
                        {day.isOnLeave ? "0h" : hours === 0 ? "—" : `${hours}h`}
                      </span>
                      {!day.isOnLeave && hours > 0 && (
                        <span className="text-xs text-gray-600">
                          {hours === 8 ? "Full day" : "Half day"}
                        </span>
                      )}
                      {!day.isOnLeave && !day.isEditable && !data.isLocked && (
                        <span title="Editable between 11:30 AM – 10:00 PM SGT">
                          <Lock className="h-3 w-3 text-gray-700" />
                        </span>
                      )}
                    </div>
                  )}

                  {/* OT indicator */}
                  <div className="text-right hidden sm:block">
                    {otEarned > 0 ? (
                      <span className="text-xs font-semibold text-emerald-400">+{otEarned}d OT</span>
                    ) : isOtDay && hours === 0 ? (
                      <span className="text-xs text-gray-600">—</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="h-4 w-4" />
                <span>Total: <span className="text-white font-semibold">{totalHours}h</span></span>
              </div>
              {otPreview > 0 && isEditing && (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Sun className="h-4 w-4" />
                  <span>OT this week: <span className="font-semibold">{otPreview} day{otPreview !== 1 ? "s" : ""}</span></span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {savedMsg && (
                <span className={`text-xs ${savedMsg.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>
                  {savedMsg}
                </span>
              )}
              {!data.isLocked && isEditing && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const reset: Record<string, number> = {};
                      for (const day of data.days) reset[day.date] = day.hours;
                      setDraft(reset);
                      setIsEditing(false);
                      setSavedMsg("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => setShowConfirm(true)} disabled={saving} size="sm">
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Save Timesheet
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* OT info note */}
          {!data.isLocked && isEditing && (
            <p className="text-xs text-gray-600">
              Hours can be edited between 11:30 AM – 10:00 PM SGT. Hours logged on weekends and public holidays automatically accrue OT leave (4h = 0.5 day, 8h = 1 day).
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
