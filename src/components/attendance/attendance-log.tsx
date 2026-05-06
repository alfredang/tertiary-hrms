"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Clock } from "lucide-react";

interface AttendanceRecord {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  dayType: "WEEKDAY" | "WEEKEND" | "PUBLIC_HOLIDAY";
  employee: { name: string; employeeId: string };
  otEntry: { id: string; earnedDays: number; status: string } | null;
}

const DAY_TYPE_BADGE: Record<string, string> = {
  WEEKDAY: "bg-gray-800 text-gray-300 border-gray-700",
  WEEKEND: "bg-amber-950 text-amber-300 border-amber-800",
  PUBLIC_HOLIDAY: "bg-red-950 text-red-300 border-red-800",
};

const OT_STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
};

export function AttendanceLog({ isAdmin = false }: { isAdmin?: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/attendance")
      .then((r) => r.json())
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle className="text-white text-lg">Attendance Log</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No attendance records yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-950">
                  {isAdmin && <th className="text-left text-xs text-gray-400 px-4 py-3">Employee</th>}
                  <th className="text-left text-xs text-gray-400 px-4 py-3">Date</th>
                  <th className="text-left text-xs text-gray-400 px-4 py-3">Clock In</th>
                  <th className="text-left text-xs text-gray-400 px-4 py-3">Clock Out</th>
                  <th className="text-left text-xs text-gray-400 px-4 py-3">Hours</th>
                  <th className="text-left text-xs text-gray-400 px-4 py-3">Day Type</th>
                  <th className="text-left text-xs text-gray-400 px-4 py-3">OT Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-900 transition-colors">
                    {isAdmin && (
                      <td className="px-4 py-3 text-xs text-white">{r.employee?.name}</td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">
                      {formatDate(new Date(r.date))}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-300">{fmt(r.clockIn)}</td>
                    <td className="px-4 py-3 text-xs text-gray-300">
                      {r.clockOut ? fmt(r.clockOut) : <span className="text-amber-400">Active</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-300">
                      {r.totalHours !== null ? `${Number(r.totalHours).toFixed(2)}h` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${DAY_TYPE_BADGE[r.dayType] ?? ""}`}>
                        {r.dayType.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.otEntry ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-emerald-400">{r.otEntry.earnedDays}d earned</span>
                          <Badge className={`text-xs border w-fit ${OT_STATUS_BADGE[r.otEntry.status] ?? ""}`}>
                            {r.otEntry.status.replace("_", " ").toLowerCase()}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
