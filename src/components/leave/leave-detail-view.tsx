"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, RotateCcw, ArrowLeft, FileText, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";

interface LeaveRequest {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  createdAt: Date | string;
  approvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  days: number | string;
  dayType: string;
  halfDayPosition?: string | null;
  reason?: string | null;
  approvalComment?: string | null;
  rejectionReason?: string | null;
  status: string;
  otDaysUsed?: number | string;
  deficitDays?: number | string;
  documentUrl?: string | null;
  documentFileName?: string | null;
  employee: { id: string; name: string; employeeId: string; department?: { name: string } | null };
  leaveType: { name: string; code: string };
  approver?: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED:  "bg-green-100 text-green-800 border-green-200",
  REJECTED:  "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 border-gray-200",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

export function LeaveDetailView({ request, isAdmin }: { request: LeaveRequest; isAdmin: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(false);

  const days = Number(request.days);
  const otUsed = Number(request.otDaysUsed ?? 0);
  const deficit = Number(request.deficitDays ?? 0);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/${request.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalComment: comment.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: "Leave approved", description: "Employee has been notified." });
      router.refresh();
      router.back();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/${request.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: comment.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: "Leave rejected", description: "Employee has been notified." });
      router.refresh();
      router.back();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/${request.id}/reset`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: "Reset to pending" });
      router.refresh();
      router.back();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Main card */}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-white">{request.leaveType.name}</p>
            <p className="text-sm text-gray-400 mt-0.5">{request.employee.name} · {request.employee.employeeId}</p>
            {request.employee.department?.name && (
              <p className="text-xs text-gray-600 mt-0.5">{request.employee.department.name}</p>
            )}
          </div>
          <Badge className={`shrink-0 ${STATUS_COLORS[request.status] ?? ""}`}>
            {request.status}
          </Badge>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          <Field label="Start Date">{formatDate(request.startDate)}</Field>
          <Field label="End Date">{formatDate(request.endDate)}</Field>
          <Field label="Days">
            <span>{days} day{days !== 1 ? "s" : ""}</span>
            {request.dayType === "AM_HALF" && <span className="ml-1 text-xs text-gray-500">(AM half)</span>}
            {request.dayType === "PM_HALF" && <span className="ml-1 text-xs text-gray-500">(PM half)</span>}
            {otUsed > 0 && (
              <span className="ml-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded px-1.5 py-0.5">
                +{otUsed}d OIL
              </span>
            )}
            {deficit > 0 && (
              <span className="ml-1.5 text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-1.5 py-0.5">
                {deficit}d deficit
              </span>
            )}
          </Field>
          <Field label="Applied On">{formatDate(request.createdAt)}</Field>
          {request.approver && (
            <Field label={request.status === "APPROVED" ? "Approved By" : "Actioned By"}>
              {request.approver.name}
            </Field>
          )}
          {(request.approvedAt || request.rejectedAt) && (
            <Field label={request.status === "APPROVED" ? "Approved On" : "Rejected On"}>
              {formatDate((request.approvedAt ?? request.rejectedAt)!)}
            </Field>
          )}
        </div>

        {/* Staff reason */}
        {request.reason && (
          <div className="bg-gray-900 rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1.5">Staff Comment / Reason</p>
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{request.reason}</p>
          </div>
        )}

        {/* Document */}
        {request.documentUrl && (
          <div className="flex items-center gap-3 bg-gray-900 rounded-xl p-3">
            <FileText className="h-5 w-5 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{request.documentFileName || "Attachment"}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewDoc(true)}
              className="shrink-0 border-gray-700 text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
            </Button>
          </div>
        )}

        {/* Admin comment (already actioned) */}
        {(request.approvalComment || request.rejectionReason) && (
          <div className={`rounded-xl p-4 ${request.status === "APPROVED" ? "bg-green-950/20 border border-green-800/40" : "bg-red-950/20 border border-red-800/40"}`}>
            <p className="text-xs font-medium uppercase tracking-wide mb-1.5 text-gray-400">Admin Comment</p>
            <p className="text-sm whitespace-pre-wrap">
              {request.status === "APPROVED"
                ? <span className="text-green-300">{request.approvalComment}</span>
                : <span className="text-red-300">{request.rejectionReason}</span>
              }
            </p>
          </div>
        )}

        {/* Admin actions */}
        {isAdmin && request.status === "PENDING" && (
          <div className="border-t border-gray-800 pt-5 space-y-3">
            {action ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-white">
                  {action === "approve" ? "Add an approval comment (optional):" : "Reason for rejection (optional):"}
                </p>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={action === "approve" ? "e.g. Enjoy your leave!" : "e.g. Insufficient balance"}
                  rows={3}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-gray-500"
                />
                <div className="flex gap-3">
                  {action === "approve" ? (
                    <Button onClick={handleApprove} disabled={loading} className="bg-green-700 hover:bg-green-600 text-white">
                      <Check className="h-4 w-4 mr-1.5" />
                      {loading ? "Approving..." : "Confirm Approve"}
                    </Button>
                  ) : (
                    <Button onClick={handleReject} disabled={loading} className="bg-red-800 hover:bg-red-700 text-white">
                      <X className="h-4 w-4 mr-1.5" />
                      {loading ? "Rejecting..." : "Confirm Reject"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => { setAction(null); setComment(""); }} disabled={loading}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button onClick={() => setAction("approve")} className="bg-green-700 hover:bg-green-600 text-white">
                  <Check className="h-4 w-4 mr-1.5" /> Approve
                </Button>
                <Button onClick={() => setAction("reject")} variant="outline" className="text-red-400 border-red-800/50 hover:bg-red-950/30 hover:text-red-300">
                  <X className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Admin reset (already actioned) */}
        {isAdmin && (request.status === "APPROVED" || request.status === "REJECTED") && (
          <div className="border-t border-gray-800 pt-4">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={loading}
              className="border-gray-700 text-amber-400 hover:text-amber-300 hover:bg-amber-950/30">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {loading ? "Resetting..." : "Reset to Pending"}
            </Button>
          </div>
        )}
      </div>

      {previewDoc && request.documentUrl && (
        <DocumentPreviewModal
          open={previewDoc}
          onOpenChange={(open) => { if (!open) setPreviewDoc(false); }}
          url={request.documentUrl}
          fileName={request.documentFileName || "document"}
        />
      )}
    </div>
  );
}
