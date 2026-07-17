"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OtLog {
  id: string;
  date: string;
  type: string;
  note: string | null;
  daysEarned: number;
  recordedBy: string | null;
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
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

interface Props {
  employeeId: string;
}

export function AdminOtLogPanel({ employeeId }: Props) {
  const [logs, setLogs] = useState<OtLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [type, setType] = useState("WEEKEND");
  const [note, setNote] = useState("");
  const [daysEarned, setDaysEarned] = useState("1");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ot-log?employeeId=${employeeId}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this OT entry? The Off In Lieu balance will be recalculated.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/ot-log?id=${id}`, { method: "DELETE" });
      await fetchLogs();
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ot-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, type, note: note || null, daysEarned: Number(daysEarned) }),
      });
      if (res.ok) {
        setShowForm(false);
        setDate(""); setNote(""); setDaysEarned("1"); setType("WEEKEND");
        await fetchLogs();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Record days worked on weekends or public holidays to credit Off In Lieu leave.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Entry
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Date Worked *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="WEEKEND">Weekend</option>
                <option value="PUBLIC_HOLIDAY">Public Holiday</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Days Earned *</label>
              <input
                type="number"
                min="0.5"
                max="3"
                step="0.5"
                value={daysEarned}
                onChange={(e) => setDaysEarned(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Project deadline, Labour Day"
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save Entry
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-gray-600">
          <Calendar className="h-7 w-7 opacity-30" />
          <p className="text-sm">No Off In Lieu entries recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white">{formatDate(log.date)}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_COLORS[log.type] ?? TYPE_COLORS.OTHER}`}>
                    {TYPE_LABELS[log.type] ?? log.type}
                  </span>
                </div>
                {log.note && <p className="text-xs text-gray-400 mt-0.5">{log.note}</p>}
                {log.recordedBy && <p className="text-[10px] text-gray-600 mt-0.5">Recorded by {log.recordedBy}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-emerald-400">+{log.daysEarned}d</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-600 hover:text-red-400"
                  onClick={() => handleDelete(log.id)}
                  disabled={deletingId === log.id}
                  title="Remove entry"
                >
                  {deletingId === log.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
