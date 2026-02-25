"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Calendar, Clock, Check, X, Pencil, RotateCcw, Search, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { LeaveStatus } from "@prisma/client";

interface LeaveRequest {
  id: string;
  startDate: Date;
  endDate: Date;
  days: any;
  reason: string | null;
  status: LeaveStatus;
  createdAt: Date;
  employee: {
    id: string;
    name: string;
    department: { name: string };
  };
  leaveType: { name: string; code: string };
  approver: { name: string } | null;
}

interface LeaveListProps {
  requests: LeaveRequest[];
  isManager: boolean;
}

const statusColors: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 border-gray-200",
};

export function LeaveList({ requests, isManager }: LeaveListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [resetReason, setResetReason] = useState("");
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { toast } = useToast();

  type LeaveSortKey = "employee" | "type" | "startDate" | "endDate" | "days" | "createdAt" | "status";
  const [sortKey, setSortKey] = useState<LeaveSortKey>("startDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.leaveType.name.toLowerCase().includes(search.toLowerCase()) ||
      r.employee.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.reason?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === "all" ? r.status !== "CANCELLED" : r.status === statusFilter;
    const startDate = new Date(r.startDate);
    const matchesDateFrom = !dateFrom || startDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || startDate <= new Date(dateTo);
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    switch (sortKey) {
      case "employee":  aVal = a.employee.name;                bVal = b.employee.name;                break;
      case "type":      aVal = a.leaveType.name;               bVal = b.leaveType.name;               break;
      case "startDate": aVal = new Date(a.startDate).getTime(); bVal = new Date(b.startDate).getTime(); break;
      case "endDate":   aVal = new Date(a.endDate).getTime();   bVal = new Date(b.endDate).getTime();   break;
      case "days":      aVal = Number(a.days);                 bVal = Number(b.days);                 break;
      case "createdAt": aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break;
      case "status": { const r: Record<string,number> = {PENDING:0,APPROVED:1,REJECTED:2,CANCELLED:3}; aVal = r[a.status]??99; bVal = r[b.status]??99; break; }
      default:          aVal = 0;                              bVal = 0;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleApprove = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/leave/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to approve");
      toast({ title: "Leave request approved", description: "The employee has been notified." });
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to approve leave request", variant: "destructive" });
    } finally {
      setIsLoading(null);
    }
  };

  const handleReject = async (id: string, reason?: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/leave/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason?.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      toast({ title: "Leave request rejected", description: "The employee has been notified." });
      setRejectConfirm(null);
      setRejectReason("");
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to reject leave request", variant: "destructive" });
    } finally {
      setIsLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/leave/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      toast({ title: "Leave request cancelled", description: "Your leave has been cancelled." });
      setCancelConfirm(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel leave request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleReset = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/leave/${id}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: resetReason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset");
      }
      toast({ title: "Leave reset to pending", description: "The request is pending review again." });
      setResetConfirm(null);
      setResetReason("");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset leave request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Render function (not a sub-component) — avoids unmount/remount on parent re-render
  const renderStaffActions = (id: string) => (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-7 px-3 text-xs border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
      >
        <Link href={`/leave/edit/${id}`}>
          <Pencil className="h-3 w-3 mr-1" />
          Edit
        </Link>
      </Button>
      {cancelConfirm === id ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-amber-400">Cancel this leave?</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCancel(id)}
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
      )}
    </div>
  );

  // Admin reset button for APPROVED/REJECTED rows (render function)
  const renderAdminResetActions = (id: string) => (
    <div className="mt-1">
      {resetConfirm === id ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Reason (optional)..."
            value={resetReason}
            onChange={(e) => setResetReason(e.target.value)}
            className="bg-gray-900 border-gray-700 text-white text-xs min-h-[60px]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => handleReset(id)}
              disabled={isLoading === id}
              className="h-7 px-3 text-xs"
            >
              {isLoading === id ? "Resetting..." : "Confirm Reset"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setResetConfirm(null); setResetReason(""); }}
              disabled={isLoading === id}
              className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setResetConfirm(id); setResetReason(""); setRejectConfirm(null); }}
          className="h-7 w-7 p-0 border-gray-700 text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 hover:border-amber-800"
          title="Reset to Pending"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  // Admin PENDING row actions (render function)
  const renderAdminPendingActions = (id: string) => (
    <>
      {rejectConfirm === id ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Rejection reason (optional)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="bg-gray-900 border-gray-700 text-white text-xs min-h-[60px]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => handleReject(id, rejectReason)}
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
      ) : (
        <div className="flex gap-2">
          <Button
            variant="success"
            size="sm"
            onClick={() => handleApprove(id)}
            disabled={isLoading === id}
            className="h-8 px-3 text-sm"
          >
            <Check className="h-4 w-4 mr-1" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRejectConfirm(id); setRejectReason(""); setResetConfirm(null); }}
            disabled={isLoading === id}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-3 text-sm"
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
        </div>
      )}
    </>
  );

  const renderSortTh = (label: string, key: LeaveSortKey) => {
    const active = sortKey === key;
    return (
      <th
        onClick={() => {
          if (active) setSortDir(d => d === "asc" ? "desc" : "asc");
          else { setSortKey(key); setSortDir("asc"); }
        }}
        className={`text-left text-xs sm:text-sm font-medium px-2 sm:px-4 py-3 whitespace-nowrap cursor-pointer select-none group ${active ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
      >
        <span className="flex items-center gap-1">
          {label}
          {active
            ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
            : <ChevronUp className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search leaves..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* Mobile/Zoom: Select dropdown */}
        <div className="lg:hidden w-full">
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
        {/* Desktop: Pill buttons */}
        <div className="hidden lg:flex flex-wrap gap-1">
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
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full sm:w-[160px]"
          />
          <span className="text-gray-400 text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full sm:w-[160px]"
          />
        </div>
      </div>

      {isManager ? (
        /* Admin View */
        <>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {sortedRequests.map((request) => (
              <div key={request.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{request.employee.name}</span>
                  <Badge className={statusColors[request.status]}>{request.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-gray-700 text-gray-300">{request.leaveType.name}</Badge>
                  <span className="text-xs text-gray-400">{Number(request.days)} day{Number(request.days) !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(request.startDate)} — {formatDate(request.endDate)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>Applied {formatDate(request.createdAt)}</span>
                </div>
                {request.status === "PENDING" && renderAdminPendingActions(request.id)}
                {(request.status === "APPROVED" || request.status === "REJECTED") && renderAdminResetActions(request.id)}
              </div>
            ))}
            {sortedRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No leave requests found</p>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800">
                  {renderSortTh("Employee", "employee")}
                  {renderSortTh("Type", "type")}
                  {renderSortTh("Start", "startDate")}
                  {renderSortTh("End", "endDate")}
                  {renderSortTh("Days", "days")}
                  {renderSortTh("Applied", "createdAt")}
                  {renderSortTh("Status", "status")}
                  <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedRequests.map((request) => (
                  <tr key={request.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-white whitespace-nowrap">
                      {request.employee.name}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                      {request.leaveType.name}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(request.startDate)}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(request.endDate)}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300">
                      {Number(request.days)}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <Badge className={statusColors[request.status]}>
                        {request.status}
                      </Badge>
                    </td>
                    <td className="px-2 sm:px-4 py-3 min-w-[200px]">
                      {request.status === "PENDING"
                        ? renderAdminPendingActions(request.id)
                        : (request.status === "APPROVED" || request.status === "REJECTED")
                          ? renderAdminResetActions(request.id)
                          : <span className="text-sm text-gray-500">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No leave requests found</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Staff View */
        <>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {sortedRequests.map((request) => (
              <div key={request.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-gray-700 text-gray-300">{request.leaveType.name}</Badge>
                  <Badge className={statusColors[request.status]}>{request.status}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(request.startDate)} — {formatDate(request.endDate)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{Number(request.days)} day{Number(request.days) !== 1 ? "s" : ""}</span>
                  <span>Applied {formatDate(request.createdAt)}</span>
                </div>
                {request.status === "PENDING" && renderStaffActions(request.id)}
              </div>
            ))}
            {sortedRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No leave requests found</p>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800">
                  {renderSortTh("Type", "type")}
                  {renderSortTh("Start", "startDate")}
                  {renderSortTh("End", "endDate")}
                  {renderSortTh("Days", "days")}
                  {renderSortTh("Applied", "createdAt")}
                  {renderSortTh("Status", "status")}
                  <th className="text-left text-xs sm:text-sm font-medium text-gray-400 px-2 sm:px-4 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedRequests.map((request) => (
                  <tr key={request.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {request.leaveType.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(request.startDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(request.endDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {Number(request.days)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[request.status]}>
                        {request.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {request.status === "PENDING" ? (
                        renderStaffActions(request.id)
                      ) : (
                        <span className="text-sm text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No leave requests found</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
