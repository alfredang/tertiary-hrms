"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateRange, getInitials } from "@/lib/utils";
import { Calendar, Clock, Check, X } from "lucide-react";
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
  const [filter, setFilter] = useState<"all" | LeaveStatus>("all");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredRequests =
    filter === "all"
      ? requests
      : requests.filter((r) => r.status === filter);

  const handleApprove = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/leave/${id}/approve`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to approve");

      toast({
        title: "Leave request approved",
        description: "The employee has been notified.",
      });

      window.location.reload();
    } catch {
      toast({
        title: "Error",
        description: "Failed to approve leave request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/leave/${id}/reject`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to reject");

      toast({
        title: "Leave request rejected",
        description: "The employee has been notified.",
      });

      window.location.reload();
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject leave request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All Requests</TabsTrigger>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {isManager ? (
        /* Admin Table View */
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-950 border-b border-gray-800">
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Employee Name</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Leave Type</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Start Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">End Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">No of Days</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Application Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Status</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredRequests.map((request) => (
                <tr key={request.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-sm text-white">
                    {request.employee.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {request.leaveType.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(request.startDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(request.endDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {Number(request.days)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(request.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={statusColors[request.status]}>
                      {request.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {request.status === "PENDING" ? (
                      <div className="flex gap-2">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleApprove(request.id)}
                          disabled={isLoading === request.id}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(request.id)}
                          disabled={isLoading === request.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRequests.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No leave requests found</p>
            </div>
          )}
        </div>
      ) : (
        /* Staff Table View (no Employee Name or Action columns) */
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-950 border-b border-gray-800">
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Leave Type</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Start Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">End Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">No of Days</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Application Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredRequests.map((request) => (
                <tr key={request.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {request.leaveType.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(request.startDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(request.endDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {Number(request.days)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(request.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={statusColors[request.status]}>
                      {request.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRequests.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No leave requests found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
