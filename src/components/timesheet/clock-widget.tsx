"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LogIn, LogOut, Loader2, AlertCircle, Pause, Play } from "lucide-react";
import { AttendanceHistory } from "./attendance-history";
import { formatTime, workedMsSoFar } from "./attendance-format";

interface Punch {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hours: number | null;
  pausedAt: string | null;
  breakSeconds: number;
}

interface AttendanceData {
  today: Punch | null;
}

/** H:MM:SS for a duration in ms. */
function formatDuration(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ClockWidget() {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Bumped after each punch so the history below refetches.
  const [reloadKey, setReloadKey] = useState(0);

  // Avoid a hydration mismatch: the live timer only renders after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load attendance");
      setData(await res.json());
    } catch {
      setError("Could not load your attendance records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Clocked in and not yet out — the shift is open (running or paused).
  const working = Boolean(data?.today?.clockIn && !data?.today?.clockOut);
  const paused = working && Boolean(data?.today?.pausedAt);

  // Tick once a second only while the clock is actually running.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!working) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    setNowMs(Date.now());
    tickRef.current = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [working]);

  async function punch(action: "clock-in" | "clock-out" | "pause" | "resume") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/attendance/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong.");
      } else {
        await load();
        setReloadKey((k) => k + 1);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/60 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  const today = data?.today ?? null;
  const doneForToday = Boolean(today?.clockIn && today?.clockOut);

  return (
    <div className="space-y-4">
      {/* Clock card */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
        <p className="text-center text-sm text-gray-400">
          {paused
            ? `On break since ${formatTime(today!.pausedAt)} — timer paused`
            : working
            ? `Working — clocked in at ${formatTime(today!.clockIn)}`
            : doneForToday
              ? `Done for today — ${formatTime(today!.clockIn)} to ${formatTime(today!.clockOut)}`
              : "You haven't clocked in today"}
        </p>

        <p
          className={`mt-2 text-center font-bold tabular-nums text-5xl sm:text-6xl ${
            paused ? "text-amber-400" : "text-white"
          }`}
          suppressHydrationWarning
        >
          {working && mounted
            ? formatDuration(workedMsSoFar(today!.clockIn!, nowMs, today!.breakSeconds, today!.pausedAt))
            : doneForToday
              ? `${today!.hours?.toFixed(2) ?? "0.00"} h`
              : "0:00:00"}
        </p>

        {working && mounted && (paused || today!.breakSeconds > 0) && (
          <p className="mt-1 text-center text-sm text-gray-400 tabular-nums" suppressHydrationWarning>
            {paused
              ? `Break ${formatDuration(nowMs - new Date(today!.pausedAt!).getTime())}`
              : `Breaks today ${formatDuration(today!.breakSeconds * 1000)}`}
          </p>
        )}
        {doneForToday && today!.breakSeconds > 0 && (
          <p className="mt-1 text-center text-sm text-gray-400">
            Excludes {formatDuration(today!.breakSeconds * 1000)} of breaks
          </p>
        )}

        <div className="mt-6 flex justify-center">
          {doneForToday ? (
            <div className="rounded-xl border border-green-800/50 bg-green-950/30 px-6 py-3 text-center text-sm font-medium text-green-400">
              Shift complete
            </div>
          ) : (
            <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
              {working && (
                <button
                  type="button"
                  onClick={() => punch(paused ? "resume" : "pause")}
                  disabled={busy}
                  className={`flex flex-1 items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-semibold text-on-color shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
                    paused
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500"
                      : "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400"
                  }`}
                >
                  {busy ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : paused ? (
                    <Play className="h-6 w-6" />
                  ) : (
                    <Pause className="h-6 w-6" />
                  )}
                  {paused ? "Continue" : "Pause"}
                </button>
              )}
              <button
                type="button"
                onClick={() => punch(working ? "clock-out" : "clock-in")}
                disabled={busy}
                className={`flex flex-1 items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-semibold text-on-color shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
                  working
                    ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : working ? (
                  <LogOut className="h-6 w-6" />
                ) : (
                  <LogIn className="h-6 w-6" />
                )}
                {busy ? "Saving…" : working ? "Clock out" : "Clock in"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      <AttendanceHistory reloadKey={reloadKey} />
    </div>
  );
}
