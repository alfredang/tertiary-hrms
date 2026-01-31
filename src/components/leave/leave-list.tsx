"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    firstName: string;
    lastName: string;
    department: { name: string };
  };
  leaveType: { name: string; code: string };
  approver: { firstName: string; lastName: string } | null;
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRequests.map((request) => (
          <Card key={request.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 bg-blue-500">
                    <AvatarFallback className="bg-blue-500 text-white">
                      {getInitials(
                        `${request.employee.firstName} ${request.employee.lastName}`
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {request.employee.firstName} {request.employee.lastName}
                    </p>
                    <p className="text-sm text-gray-500">
                      {request.leaveType.name}
                    </p>
                  </div>
                </div>
                <Badge className={statusColors[request.status]}>
                  {request.status}
                </Badge>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {formatDateRange(request.startDate, request.endDate)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>{Number(request.days)} days</span>
                </div>
              </div>

              {request.reason && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                  {request.reason}
                </div>
              )}

              {isManager && request.status === "PENDING" && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleApprove(request.id)}
                    disabled={isLoading === request.id}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReject(request.id)}
                    disabled={isLoading === request.id}
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRequests.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No leave requests found</p>
        </div>
      )}
    </div>
  );
}
