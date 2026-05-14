"use client";

import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Briefcase, Calendar, Info } from "lucide-react";

interface OtLog {
  id: string;
  date: string;
  type: string;
  note: string | null;
  daysEarned: number;
  recordedBy: string | null;
  createdAt: string;
}

interface OtStats {
  earned: number;
  used: number;
  autoDeducted: number;
  pending: number;
  remaining: number;
}

const TYPE_LABELS: Record<string, string> = {
  WEEKEND: "Weekend",
  PUBLIC_HOLIDAY: "Public Holiday",
  OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  WEEKEND: "text-blue-400 bg-blue-950/30 border-blue-800/40",
  PUBLIC_HOLIDAY: "text-amber-400 bg-amber-950/30 border-amber-800/40",
  OTHER: "text-gray-400 bg-gray-900 border-gray-800",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  otStats: OtStats;
  employeeId?: string;
}

export function OtBreakdownDialog({ otStats, employeeId }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<OtLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = employeeId ? `/api/ot-log?employeeId=${employeeId}` : "/api/ot-log";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [open, employeeId]);

  const remainingColor = otStats.remaining < 0 ? "text-red-400" : "text-emerald-400";

  return (
    <>
      {/* Clickable OT section header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 flex-wrap group cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className={`h-2 w-2 rounded-full ${otStats.remaining < 0 ? "bg-red-400" : "bg-emerald-400"}`} />
        <h3 className={`text-sm font-semibold ${otStats.remaining < 0 ? "text-red-400" : "text-emerald-400"}`}>
          Accumulated OT Leave Balance
        </h3>
        <span className="text-xs text-gray-500">Earned from weekend / public holiday work</span>
        <Info className="h-3 w-3 text-gray-600 group-hover:text-gray-400 transition-colors" />
        <span className="text-xs text-gray-600 group-hover:text-gray-500 transition-colors">Click for breakdown</span>
        {otStats.remaining < 0 && (
          <span className="ml-auto text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded px-2 py-0.5">
            {Math.abs(otStats.remaining)} day(s) deficit — offset by future OT work
          </span>
        )}
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg max-h-[85vh] overflow-y-auto bg-gray-950 border border-gray-800 rounded-xl p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <DialogPrimitive.Title className="text-base font-semibold text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                OT Leave Breakdown
                <span className="text-xs font-normal text-gray-400">({new Date().getFullYear()})</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="text-gray-400 hover:text-white transition-colors rounded-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            {/* Summary bar */}
            <div className="bg-gray-900 rounded-lg p-3 grid grid-cols-4 gap-2 text-center text-xs mb-4">
              <div>
                <p className="text-gray-400">Earned</p>
                <p className="text-emerald-400 font-bold text-base">{otStats.earned}</p>
              </div>
              <div>
                <p className="text-gray-400">Used</p>
                <p className="text-amber-400 font-bold text-base">{otStats.used}</p>
              </div>
              <div>
                <p className="text-gray-400">Deficit</p>
                <p className="text-red-400 font-bold text-base">{otStats.autoDeducted}</p>
              </div>
              <div>
                <p className="text-gray-400">Remaining</p>
                <p className={`font-bold text-base ${remainingColor}`}>{otStats.remaining}</p>
              </div>
            </div>

            {/* Work log */}
            <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Days Worked</p>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-500 text-sm">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-gray-600">
                <Calendar className="h-8 w-8 opacity-30" />
                <p className="text-sm">No OT work records found</p>
                <p className="text-xs text-center text-gray-700 max-w-xs">
                  OT days are recorded by your admin when you work on weekends or public holidays.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{formatDate(log.date)}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_COLORS[log.type] ?? TYPE_COLORS.OTHER}`}>
                          {TYPE_LABELS[log.type] ?? log.type}
                        </span>
                      </div>
                      {log.note && (
                        <p className="text-xs text-gray-400 mt-0.5">{log.note}</p>
                      )}
                      {log.recordedBy && (
                        <p className="text-[10px] text-gray-600 mt-0.5">Recorded by {log.recordedBy}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-emerald-400">+{log.daysEarned}d</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {otStats.remaining < 0 && (
              <div className="mt-3 bg-red-950/20 border border-red-800/40 rounded-lg p-2.5 text-xs text-red-300">
                You have a deficit of {Math.abs(otStats.remaining)} day(s). Work on weekends or public holidays to earn OT days and reduce this.
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
