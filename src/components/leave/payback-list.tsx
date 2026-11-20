"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, X, Search, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TextViewDialog, TruncatedTextButton, type TextView } from "@/components/ui/text-view-dialog";
import { dayCountLabel, prettyDay } from "@/lib/npl-payback";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface PaybackRow {
  id: string;
  employeeName: string;
  /** YYYY-MM-DD */
  nplDate: string;
  workDate: string;
  days: number;
  note: string | null;
  status: Status;
  approvalComment: string | null;
  rejectionReason: string | null;
  /** YYYY-MM-DD */
  appliedOn: string;
  /** Admin view: clock-in / clock-out on the off day worked, e.g. "9:02 am – 6:05 pm"; null = no punch. */
  clocked?: string | null;
}

const statusColors: Record<Status, string> = {
  PENDING: "bg-amber-900 text-amber-200 border-amber-800",
  APPROVED: "bg-green-900 text-green-200 border-green-800",
  REJECTED: "bg-red-900 text-red-200 border-red-800",
  CANCELLED: "bg-gray-900 text-gray-300 border-gray-800",
};

const th = "text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3";
const td = "px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300";

export function PaybackList({ rows, isManager }: { rows: PaybackRow[]; isManager: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState<string | null>(null);
  // The row being approved / rejected / cancelled, with the optional comment typed for it.
  const [confirm, setConfirm] = useState<{ id: string; kind: "approve" | "reject" | "cancel" } | null>(null);
  const [comment, setComment] = useState("");
  const [textView, setTextView] = useState<TextView | null>(null);

  const filtered = rows.filter((r) => {
    const hay = `${r.employeeName} ${prettyDay(r.nplDate)} ${prettyDay(r.workDate)} ${r.note ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase()) && (statusFilter === "all" ? r.status !== "CANCELLED" : r.status === statusFilter);
  });

  const act = async (id: string, path: "approve" | "reject" | "cancel", body: Record<string, unknown> | undefined, done: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/leave/payback/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error((await res.json()).error || `Failed to ${path}`);
      toast({ title: done });
      setConfirm(null);
      setComment("");
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : `Failed to ${path}`, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const open = (kind: "approve" | "reject" | "cancel", id: string) => {
    setConfirm({ id, kind });
    setComment("");
  };

  const actions = (r: PaybackRow) => {
    const confirming = confirm?.id === r.id ? confirm.kind : null;
    if (confirming === "approve" || confirming === "reject") {
      const approve = confirming === "approve";
      return (
        <div className="flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={approve ? "Note for the employee (optional)" : "Reason (optional)"}
            rows={2}
            className="text-xs rounded bg-gray-900 border border-gray-700 text-white px-2 py-1 resize-none w-full max-w-xs"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              disabled={busy === r.id}
              onClick={() =>
                approve
                  ? act(r.id, "approve", { approvalComment: comment.trim() || undefined }, "Payback approved")
                  : act(r.id, "reject", { reason: comment.trim() || undefined }, "Payback rejected")
              }
              className={`h-7 px-3 text-xs text-on-color ${approve ? "bg-green-700 hover:bg-green-600" : "bg-red-800 hover:bg-red-700"}`}
            >
              {busy === r.id ? "Saving..." : approve ? "Confirm Approve" : "Confirm Reject"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setConfirm(null)} className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800">
              Cancel
            </Button>
          </div>
        </div>
      );
    }
    if (confirming === "cancel") {
      const withdraw = r.status === "APPROVED";
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-amber-400">{withdraw ? "Withdraw this approved payback?" : "Cancel this request?"}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === r.id}
            onClick={() => act(r.id, "cancel", undefined, withdraw ? "Payback withdrawn" : "Payback request cancelled")}
            className="h-7 px-3 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
          >
            {busy === r.id ? "Saving..." : "Yes"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setConfirm(null)} className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800">
            No
          </Button>
        </div>
      );
    }
    if (r.status === "PENDING" && isManager) {
      return (
        <div className="flex gap-1.5">
          <Button variant="success" size="sm" disabled={busy === r.id} onClick={() => open("approve", r.id)} className="h-7 px-2.5 text-xs">
            <Check className="h-3 w-3 mr-1" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy === r.id}
            onClick={() => open("reject", r.id)}
            className="h-7 px-2.5 text-xs text-red-400 border-red-800/50 hover:bg-red-950/30 hover:text-red-300"
          >
            <X className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </div>
      );
    }
    if (r.status === "PENDING") {
      return (
        <Button size="sm" variant="outline" onClick={() => open("cancel", r.id)} className="h-7 px-2 text-xs border-gray-700 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:border-red-800">
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      );
    }
    if (r.status === "APPROVED" && isManager) {
      return (
        <Button size="sm" variant="outline" onClick={() => open("cancel", r.id)} className="h-7 px-2 text-xs border-gray-700 text-gray-300 hover:bg-gray-800">
          <Undo2 className="h-3 w-3 mr-1" />
          Withdraw
        </Button>
      );
    }
    return null;
  };

  const decisionText = (r: PaybackRow) => (r.status === "REJECTED" ? r.rejectionReason : r.status === "APPROVED" ? r.approvalComment : null);
  const tone = (r: PaybackRow) => (r.status === "REJECTED" ? "text-red-400" : "text-green-400");
  const subtitle = (r: PaybackRow) => `${r.employeeName} · worked ${prettyDay(r.workDate)} for ${prettyDay(r.nplDate)}`;
  const clocked = (r: PaybackRow) =>
    r.clocked ? <span className="text-gray-300">{r.clocked}</span> : <span className="text-gray-500">No clock-in</span>;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search paybacks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === v ? "bg-primary text-on-color" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {v === "all" ? "All" : v.charAt(0) + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.map((r) => (
          <div key={r.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-white">{isManager ? r.employeeName : `Worked ${prettyDay(r.workDate)}`}</span>
              <Badge className={`min-w-[88px] justify-center ${statusColors[r.status]}`}>{r.status}</Badge>
            </div>
            <p className="text-xs text-gray-400">No Pay Leave: {prettyDay(r.nplDate)}</p>
            <p className="text-xs text-gray-400">Worked on: {prettyDay(r.workDate)} · {dayCountLabel(r.days)}</p>
            {isManager && <p className="text-xs">Clocked: {clocked(r)}</p>}
            {r.note && <p className="text-xs text-gray-400 break-words allow-wrap">{r.note}</p>}
            {decisionText(r) && <p className={`text-xs break-words allow-wrap ${tone(r)}`}>{decisionText(r)}</p>}
            {actions(r)}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-12 text-gray-500">No payback requests found</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-lg border border-gray-700 bg-gray-950 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800">
              {isManager && <th className={th}>Employee</th>}
              <th className={th}>Status</th>
              <th className={th}>No Pay Leave day</th>
              <th className={th}>Worked on (off day)</th>
              <th className={th}>Pays back</th>
              {isManager && <th className={th}>Clocked that day</th>}
              <th className={th}>Applied</th>
              <th className={th}>Note</th>
              <th className={th}>Comment</th>
              <th className={th}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((r) => (
              <tr key={r.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                {isManager && <td className={`${td} text-white`}>{r.employeeName}</td>}
                <td className={td}>
                  <Badge className={`min-w-[88px] justify-center ${statusColors[r.status]}`}>{r.status}</Badge>
                </td>
                <td className={td}>{prettyDay(r.nplDate)}</td>
                <td className={td}>{prettyDay(r.workDate)}</td>
                <td className={td}>{dayCountLabel(r.days)}</td>
                {isManager && <td className={td}>{clocked(r)}</td>}
                <td className={td}>{prettyDay(r.appliedOn)}</td>
                <td className={td}>
                  <TruncatedTextButton text={r.note} onOpen={() => setTextView({ title: "Note", subtitle: subtitle(r), text: r.note ?? "", tone: "text-white" })} />
                </td>
                <td className={td}>
                  {decisionText(r) ? (
                    <TruncatedTextButton
                      text={decisionText(r)}
                      tone={tone(r)}
                      onOpen={() => setTextView({ title: r.status === "REJECTED" ? "Rejection reason" : "Comment", subtitle: subtitle(r), text: decisionText(r) ?? "", tone: tone(r) })}
                    />
                  ) : (
                    <span className="text-xs text-gray-500">—</span>
                  )}
                </td>
                <td className={`${td} min-w-[180px]`}>{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-12 text-gray-500">No payback requests found</p>}
      </div>

      <TextViewDialog view={textView} onClose={() => setTextView(null)} />
    </div>
  );
}
