"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Clock } from "lucide-react";

interface AttendanceRecord {
  id: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  dayType: "WEEKDAY" | "WEEKEND" | "PUBLIC_HOLIDAY";
  otEntry?: { earnedDays: number; status: string } | null;
}

const DAY_TYPE_LABELS: Record<string, string> = {
  WEEKDAY: "Weekday",
  WEEKEND: "Weekend",
  PUBLIC_HOLIDAY: "Public Holiday",
};

const DAY_TYPE_COLORS: Record<string, string> = {
  WEEKDAY: "text-gray-400",
  WEEKEND: "text-amber-400",
  PUBLIC_HOLIDAY: "text-red-400",
};

export function ClockWidget() {
  const router = useRouter();
  const { toast } = useToast();
  const [now, setNow] = useState(new Date());
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/today");
      const data = await res.json();
      setRecord(data.record ?? null);
    } catch {
      // silently fail
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const handleClockIn = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/attendance/clock-in", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clock in");
      toast({ title: "Clocked In", description: `Clocked in at ${new Date(data.clockIn).toLocaleTimeString("en-SG")}` });
      await fetchToday();
      router.refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to clock in", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClockOut = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/attendance/clock-out", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clock out");
      const hrs = Number(data.attendance.totalHours ?? 0).toFixed(2);
      let desc = `Clocked out after ${hrs} hours.`;
      if (data.otEntry) {
        desc += ` ${data.otEntry.earnedDays} OT day(s) pending admin approval.`;
      }
      toast({ title: "Clocked Out", description: desc });
      await fetchToday();
      router.refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to clock out", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const clockInTime = record ? new Date(record.clockIn) : null;
  const clockOutTime = record?.clockOut ? new Date(record.clockOut) : null;
  const elapsed = clockInTime && !clockOutTime
    ? Math.floor((now.getTime() - clockInTime.getTime()) / 1000)
    : null;

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const status = !record ? "Not Started" : record.clockOut ? "Done" : "Working";

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardContent className="p-6 space-y-6">
        {/* Clock */}
        <div className="text-center">
          <p className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-wider">
            {now.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {now.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Status */}
        {!isFetching && (
          <div className="bg-gray-900 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className={status === "Working" ? "text-green-400 font-semibold" : status === "Done" ? "text-blue-400" : "text-gray-500"}>
                {status}
              </span>
            </div>
            {record && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">Day Type</span>
                  <span className={DAY_TYPE_COLORS[record.dayType]}>{DAY_TYPE_LABELS[record.dayType]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Clock In</span>
                  <span className="text-white">{clockInTime?.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {clockOutTime && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Clock Out</span>
                    <span className="text-white">{clockOutTime.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
                {elapsed !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Duration</span>
                    <span className="text-green-400 font-mono">{formatElapsed(elapsed)}</span>
                  </div>
                )}
                {record.clockOut && record.totalHours !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Hours</span>
                    <span className="text-white font-semibold">{Number(record.totalHours).toFixed(2)}h</span>
                  </div>
                )}
                {record.otEntry && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">OT Entry</span>
                    <span className="text-emerald-400">{record.otEntry.earnedDays} day(s) — {record.otEntry.status.replace("_", " ").toLowerCase()}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Weekend/PH notice */}
        {record && record.dayType !== "WEEKDAY" && !record.otEntry && !record.clockOut && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-xs text-amber-300">
            <Clock className="h-3 w-3 inline mr-1" />
            Working on a {DAY_TYPE_LABELS[record.dayType]}. OT leave will be logged when you clock out (≥4 hours earns 0.5 day, ≥8 hours earns 1 day).
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleClockIn}
            disabled={isLoading || !!record || isFetching}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white disabled:opacity-40"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Clock In
          </Button>
          <Button
            onClick={handleClockOut}
            disabled={isLoading || !record || !!record?.clockOut || isFetching}
            className="flex-1 bg-red-700 hover:bg-red-600 text-white disabled:opacity-40"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Clock Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
