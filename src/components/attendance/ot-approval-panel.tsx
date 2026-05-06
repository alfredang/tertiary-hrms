"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Check, X, Briefcase } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface OtEntry {
  id: string;
  date: string;
  hoursWorked: number;
  earnedDays: number;
  dayType: "WEEKEND" | "PUBLIC_HOLIDAY";
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  employee: { name: string; employeeId: string; department: { name: string } | null };
  attendance: { clockIn: string; clockOut: string | null } | null;
  approver: { name: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
};

export function OtApprovalPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<OtEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [filter, setFilter] = useState<"PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "all">("PENDING_APPROVAL");

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ot-entries?status=${filter}`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntries(); }, [filter]);

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/ot-entries/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to approve");
      toast({ title: "OT Approved", description: "OT leave credited to employee." });
      await fetchEntries();
      router.refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/ot-entries/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to reject");
      toast({ title: "OT Rejected", description: "Entry rejected and employee notified." });
      setRejectId(null);
      setRejectReason("");
      await fetchEntries();
      router.refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const fmtTime = (s: string) => new Date(s).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-emerald-400" />
          <CardTitle className="text-white text-lg">OT / Weekend Work Approvals</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {(["PENDING_APPROVAL", "APPROVED", "REJECTED", "all"] as const).map((v) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === v ? "bg-white text-gray-900" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}>
              {v === "all" ? "All" : v === "PENDING_APPROVAL" ? "Pending" : v.charAt(0) + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-gray-500 text-sm py-8">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">No OT entries found.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{entry.employee.name}</span>
                      <Badge className={`text-xs border ${STATUS_BADGE[entry.status]}`}>
                        {entry.status.replace("_", " ").toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400">
                      {entry.employee.department?.name} · {entry.employee.employeeId}
                    </p>
                    <p className="text-xs text-gray-300">
                      {formatDate(new Date(entry.date))} &nbsp;·&nbsp;
                      <span className={entry.dayType === "PUBLIC_HOLIDAY" ? "text-red-400" : "text-amber-400"}>
                        {entry.dayType.replace("_", " ")}
                      </span>
                    </p>
                    {entry.attendance && (
                      <p className="text-xs text-gray-500">
                        {fmtTime(entry.attendance.clockIn)} — {entry.attendance.clockOut ? fmtTime(entry.attendance.clockOut) : "active"}
                        &nbsp;·&nbsp; {Number(entry.hoursWorked).toFixed(2)}h worked
                      </p>
                    )}
                    <p className="text-xs font-semibold text-emerald-400">+{entry.earnedDays} OT day(s)</p>
                    {entry.rejectionReason && (
                      <p className="text-xs text-red-400">Reason: {entry.rejectionReason}</p>
                    )}
                  </div>

                  {entry.status === "PENDING_APPROVAL" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {rejectId === entry.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Rejection reason (optional)"
                            rows={2}
                            className="text-xs rounded bg-gray-950 border border-gray-700 text-white px-2 py-1 resize-none w-48" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleReject(entry.id)} disabled={actionId === entry.id}
                              className="h-7 px-3 text-xs bg-red-800 hover:bg-red-700 text-white flex-1">
                              {actionId === entry.id ? "..." : "Confirm"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}
                              className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800 flex-1">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApprove(entry.id)} disabled={!!actionId}
                            className="h-8 px-3 text-sm bg-green-700 hover:bg-green-600 text-white">
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setRejectId(entry.id); setRejectReason(""); }}
                            disabled={!!actionId}
                            className="h-8 px-3 text-sm border-red-800 text-red-400 hover:bg-red-950/30">
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
