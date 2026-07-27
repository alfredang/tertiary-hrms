"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { formatTime12h, timeOffReasonLabel } from "@/lib/time-off";
import { Calendar, Check, X, Search, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { LeaveStatus, TimeOffReason } from "@prisma/client";

export interface TimeOffRow {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  hours: any;
  reason: TimeOffReason;
  reasonDetail: string | null;
  status: LeaveStatus;
  approvalComment: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  employee: { id: string; name: string; department: { name: string } | null };
  approver: { name: string } | null;
}

const statusColors: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 border-gray-200",
};

export function TimeOffList({
  requests,
  isManager,
}: {
  requests: TimeOffRow[];
  isManager: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveStatus>("all");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState("");
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);

  const filtered = requests.filter((r) => {
    const haystack = [
      r.employee.name,
      timeOffReasonLabel(r.reason),
      r.reasonDetail ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ? r.status !== "CANCELLED" : r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const act = async (
    id: string,
    path: "approve" | "reject" | "cancel",
    body?: Record<string, unknown>,
    successTitle?: string,
  ) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/time-off/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error((await res.json()).error || `Failed to ${path}`);
      toast({ title: successTitle ?? "Done" });
      setApproveConfirm(null);
      setApproveComment("");
      setRejectConfirm(null);
      setRejectReason("");
      setCancelConfirm(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${path}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const renderReason = (r: TimeOffRow) => (
    <div className="min-w-0">
      <span className="text-xs sm:text-sm text-white">{timeOffReasonLabel(r.reason)}</span>
      {r.reasonDetail && (
        <p className="text-xs text-gray-400 mt-0.5 break-words">{r.reasonDetail}</p>
      )}
    </div>
  );

  const renderComment = (r: TimeOffRow) => {
    if (r.status === "APPROVED" && r.approvalComment)
      return <span className="text-xs text-green-400">{r.approvalComment}</span>;
    if (r.status === "REJECTED" && r.rejectionReason)
      return <span className="text-xs text-red-400">{r.rejectionReason}</span>;
    return <span className="text-xs text-gray-600">—</span>;
  };

  const renderManagerActions = (id: string) => {
    if (approveConfirm === id) {
      return (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-green-400">Approval comment (optional):</span>
          <textarea
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
            placeholder="Add a note for the employee..."
            rows={2}
            className="text-xs rounded bg-gray-900 border border-gray-700 text-white px-2 py-1 resize-none w-full max-w-xs"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() =>
                act(id, "approve", { approvalComment: approveComment.trim() || undefined }, "Time off approved")
              }
              disabled={isLoading === id}
              className="h-7 px-3 text-xs bg-green-700 hover:bg-green-600 text-white"
            >
              {isLoading === id ? "Approving..." : "Confirm Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setApproveConfirm(null); setApproveComment(""); }}
              disabled={isLoading === id}
              className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    if (rejectConfirm === id) {
      return (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-red-400">Rejection reason (optional):</span>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter reason..."
            rows={2}
            className="text-xs rounded bg-gray-900 border border-gray-700 text-white px-2 py-1 resize-none w-full max-w-xs"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => act(id, "reject", { reason: rejectReason.trim() || undefined }, "Time off rejected")}
              disabled={isLoading === id}
              className="h-7 px-3 text-xs bg-red-800 hover:bg-red-700 text-white"
            >
              {isLoading === id ? "Rejecting..." : "Confirm Reject"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setRejectConfirm(null); setRejectReason(""); }}
              disabled={isLoading === id}
              className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex gap-1.5">
        <Button
          variant="success"
          size="sm"
          onClick={() => { setApproveConfirm(id); setRejectConfirm(null); setApproveComment(""); }}
          disabled={isLoading === id}
          className="h-7 px-2.5 text-xs"
        >
          <Check className="h-3 w-3 mr-1" />
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRejectConfirm(id); setApproveConfirm(null); setRejectReason(""); }}
          disabled={isLoading === id}
          className="h-7 px-2.5 text-xs text-red-400 border-red-800/50 hover:bg-red-950/30 hover:text-red-300"
        >
          <X className="h-3 w-3 mr-1" />
          Reject
        </Button>
      </div>
    );
  };

  const renderStaffActions = (id: string) =>
    cancelConfirm === id ? (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-amber-400">Cancel this request?</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => act(id, "cancel", undefined, "Time off request cancelled")}
          disabled={isLoading === id}
          className="h-7 px-3 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
        >
          {isLoading === id ? "Cancelling..." : "Yes, Cancel"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCancelConfirm(null)}
          disabled={isLoading === id}
          className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
        >
          No
        </Button>
      </div>
    ) : (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setCancelConfirm(id)}
        className="h-7 px-2 text-xs border-gray-700 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:border-red-800"
      >
        <X className="h-3 w-3 mr-1" />
        Cancel
      </Button>
    );

  const timeRange = (r: TimeOffRow) =>
    `${formatTime12h(r.startTime)} – ${formatTime12h(r.endTime)}`;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search time off requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="md:hidden">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="hidden md:flex flex-wrap gap-1">
          {(["all", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === v
                  ? "bg-white text-gray-900"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
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
          <div key={r.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              {isManager ? (
                <span className="text-sm font-medium text-white">{r.employee.name}</span>
              ) : (
                <span className="text-sm font-medium text-white">{timeOffReasonLabel(r.reason)}</span>
              )}
              <Badge className={`min-w-[88px] justify-center ${statusColors[r.status]}`}>{r.status}</Badge>
            </div>
            {isManager && renderReason(r)}
            {!isManager && r.reasonDetail && (
              <p className="text-xs text-gray-400 break-words">{r.reasonDetail}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{formatDate(r.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{timeRange(r)} ({Number(r.hours)}h)</span>
            </div>
            <div>{renderComment(r)}</div>
            {r.status === "PENDING" &&
              (isManager ? renderManagerActions(r.id) : renderStaffActions(r.id))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No time off requests found</p>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800">
              {isManager && (
                <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Employee</th>
              )}
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Reason</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Date</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Time</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Hours</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Applied</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Status</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Comment</th>
              <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((r) => (
              <tr key={r.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                {isManager && (
                  <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-white whitespace-nowrap">
                    {r.employee.name}
                  </td>
                )}
                <td className="px-2 sm:px-4 py-3 max-w-[220px]">{renderReason(r)}</td>
                <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                  {formatDate(r.date)}
                </td>
                <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                  {timeRange(r)}
                </td>
                <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                  {Number(r.hours)}h
                </td>
                <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                  {formatDate(r.createdAt)}
                </td>
                <td className="px-2 sm:px-4 py-3">
                  <Badge className={`min-w-[88px] justify-center ${statusColors[r.status]}`}>
                    {r.status}
                  </Badge>
                </td>
                <td className="px-2 sm:px-4 py-3 max-w-[200px]">{renderComment(r)}</td>
                <td className="px-2 sm:px-4 py-3 min-w-[180px]">
                  {r.status === "PENDING"
                    ? isManager
                      ? renderManagerActions(r.id)
                      : renderStaffActions(r.id)
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No time off requests found</p>
          </div>
        )}
      </div>
    </div>
  );
}
