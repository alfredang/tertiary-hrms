"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDay, formatTime } from "@/components/timesheet/attendance-format";

type Kind = "CLOCK_IN" | "CLOCK_OUT" | "BOTH";

interface Correction {
  id: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  kind: Kind;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  currentClockIn: string | null;
  currentClockOut: string | null;
  reason: string;
  status: string;
  rejectionReason: string | null;
}

interface Missed {
  date: string;
  kind: "NO_CLOCK_OUT" | "NO_CLOCK_IN";
}

const KIND_LABEL: Record<Kind, string> = { CLOCK_IN: "Clock-in", CLOCK_OUT: "Clock-out", BOTH: "Both" };
const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-950/50 border-amber-800 text-amber-300",
  APPROVED: "bg-green-950/50 border-green-800 text-green-300",
  REJECTED: "bg-red-950/50 border-red-800 text-red-300",
  CANCELLED: "bg-gray-900 border-gray-700 text-gray-400",
};

function requestedText(c: Correction) {
  return [
    c.requestedClockIn && `in ${formatTime(c.requestedClockIn)}`,
    c.requestedClockOut && `out ${formatTime(c.requestedClockOut)}`,
  ].filter(Boolean).join(", ");
}

/** Employee side: missed punches banner, the "missing punch" form and own requests. */
export function MissingPunchPanel() {
  const { toast } = useToast();
  const [missed, setMissed] = useState<Missed[]>([]);
  const [isIntern, setIsIntern] = useState(false);
  const [mine, setMine] = useState<Correction[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<Kind>("CLOCK_OUT");
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([
      fetch("/api/attendance/missed", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { missed: [], isIntern: false })),
      fetch("/api/attendance/corrections", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ]).catch(() => [{ missed: [], isIntern: false }, []]);
    setMissed(m.missed ?? []);
    setIsIntern(!!m.isIntern);
    setMine(Array.isArray(c) ? c : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startFix = (m?: Missed) => {
    setOpen(true);
    if (m) {
      setDate(m.date);
      setKind(m.kind === "NO_CLOCK_OUT" ? "CLOCK_OUT" : "BOTH");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, kind, clockInTime, clockOutTime, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not submit");
      toast({ title: "Correction submitted", description: "An admin will review your missing punch." });
      setOpen(false);
      setReason("");
      setClockInTime("");
      setClockOutTime("");
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not submit", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    const res = await fetch(`/api/attendance/corrections/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (res.ok) await load();
  };

  const wantIn = kind === "CLOCK_IN" || kind === "BOTH";
  const wantOut = kind === "CLOCK_OUT" || kind === "BOTH";

  return (
    <div className="space-y-4">
      {missed.length > 0 && (
        <div className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-4 space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {isIntern ? "Interns must clock in and clock out every workday." : "You forgot to clock out."} Please fix:
          </p>
          <ul className="space-y-1.5">
            {missed.map((m) => (
              <li key={`${m.date}-${m.kind}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-200">
                  {formatDay(m.date)} — <span className="text-amber-300">{m.kind === "NO_CLOCK_OUT" ? "no clock-out" : "no clock-in"}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => startFix(m)}>Submit missing punch</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold">Missing clock-in / clock-out</h2>
            <p className="text-xs text-gray-500 mt-0.5">Forgot to punch? Ask an admin to add the time for that day.</p>
          </div>
          {!open && <Button size="sm" onClick={() => startFix()}>New request</Button>}
        </div>

        {open && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-white">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-gray-900 border-gray-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white">What is missing?</Label>
                <div className="flex gap-2">
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <button key={k} type="button" onClick={() => setKind(k)}
                      className={`px-3 py-2 rounded-lg text-sm border ${kind === k ? "bg-primary text-primary-foreground border-primary" : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white"}`}>
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
              {wantIn && (
                <div className="space-y-1.5">
                  <Label className="text-white">Clock-in time (SGT)</Label>
                  <Input type="time" value={clockInTime} onChange={(e) => setClockInTime(e.target.value)} required className="bg-gray-900 border-gray-700 text-white" />
                </div>
              )}
              {wantOut && (
                <div className="space-y-1.5">
                  <Label className="text-white">Clock-out time (SGT)</Label>
                  <Input type="time" value={clockOutTime} onChange={(e) => setClockOutTime(e.target.value)} required className="bg-gray-900 border-gray-700 text-white" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Forgot to clock out before leaving at 6pm"
                className="bg-gray-900 border-gray-700 text-white min-h-[70px]" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy || !date}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Submit
              </Button>
            </div>
          </form>
        )}

        {mine.length > 0 && (
          <ul className="divide-y divide-gray-800 text-sm">
            {mine.slice(0, 10).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-gray-200">{formatDay(c.date)} · {KIND_LABEL[c.kind]} · {requestedText(c)}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.reason}{c.rejectionReason ? ` — rejected: ${c.rejectionReason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[c.status] ?? STATUS_STYLE.CANCELLED}`}>{c.status.toLowerCase()}</span>
                  {c.status === "PENDING" && (
                    <button type="button" onClick={() => cancel(c.id)} className="text-gray-500 hover:text-white" aria-label="Cancel request">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Admin side: pending missing-punch corrections with approve / reject. */
export function CorrectionApprovals() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Correction[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/attendance/corrections?scope=all&status=PENDING", { cache: "no-store" });
    setRows(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    let comment: string | undefined;
    if (action === "reject") {
      comment = window.prompt("Reason for rejecting (optional)") ?? undefined;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/attendance/corrections/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed");
      toast({ title: action === "approve" ? "Correction approved" : "Correction rejected" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (rows === null) return null;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 sm:p-5 space-y-3">
      <h2 className="text-white font-semibold">Missing punch requests {rows.length > 0 && <span className="text-amber-400">({rows.length} pending)</span>}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Nothing waiting for approval.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Recorded</th>
                <th className="py-2 pr-3">Requested</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((c) => (
                <tr key={c.id} className="text-gray-200">
                  <td className="py-2 pr-3">{c.employeeName} <span className="text-gray-500">({c.employeeCode})</span></td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDay(c.date)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-400">{formatTime(c.currentClockIn)} – {formatTime(c.currentClockOut)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-amber-300">{requestedText(c)}</td>
                  <td className="py-2 pr-3 text-gray-400 max-w-[240px] truncate" title={c.reason}>{c.reason}</td>
                  <td className="py-2 whitespace-nowrap text-right space-x-2">
                    <Button size="sm" onClick={() => act(c.id, "approve")} disabled={busyId === c.id}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => act(c.id, "reject")} disabled={busyId === c.id}>Reject</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
