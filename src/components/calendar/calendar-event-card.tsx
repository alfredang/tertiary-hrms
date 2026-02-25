"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2 } from "lucide-react";

const eventTypeLabels: Record<string, { label: string; dotColor: string; badgeClass: string }> = {
  HOLIDAY: { label: "Holiday", dotColor: "bg-red-500", badgeClass: "bg-red-500/20 text-red-400 border-red-500/30" },
  MEETING: { label: "Meeting", dotColor: "bg-blue-500", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  TRAINING: { label: "Training", dotColor: "bg-purple-500", badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  COMPANY_EVENT: { label: "Company Event", dotColor: "bg-green-500", badgeClass: "bg-green-500/20 text-green-400 border-green-500/30" },
};

interface CalendarEventCardProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    startDate: Date;
    endDate: Date;
    createdById: string | null;
  };
  currentUserId: string | null;
  isAdmin: boolean;
}

export function CalendarEventCard({ event, currentUserId, isAdmin }: CalendarEventCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmState, setConfirmState] = useState<"idle" | "confirmDelete">("idle");
  const [isLoading, setIsLoading] = useState(false);

  // isOwner = any authenticated user OR admin (session.user.id via token.sub may be null
  // in some NextAuth v5 beta builds; isAdmin comes from role which is reliably set)
  const isOwner = !!currentUserId || isAdmin;

  const typeInfo = eventTypeLabels[event.type] || {
    label: event.type,
    dotColor: "bg-gray-500",
    badgeClass: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/calendar/${event.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete event");
      }
      toast({ title: "Event deleted", description: "The calendar event has been deleted." });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete event",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setConfirmState("idle");
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-3 h-3 rounded-full flex-shrink-0", typeInfo.dotColor)} />
          <span className="font-medium text-white">{event.title}</span>
        </div>
        <Badge className={typeInfo.badgeClass}>
          {typeInfo.label}
        </Badge>
      </div>

      {event.description && (
        <p className="text-sm text-gray-400 pl-5">{event.description}</p>
      )}

      <div className="text-sm text-gray-400 pl-5">
        {formatDate(event.startDate)} — {formatDate(event.endDate)}
      </div>

      {/* Edit / Delete actions — only for event owner */}
      {isOwner && (
        <div className="pl-5 pt-1">
          {confirmState === "idle" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/calendar/edit/${event.id}`)}
                className="h-7 px-3 text-xs border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmState("confirmDelete")}
                className="h-7 px-3 text-xs border-gray-700 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:border-red-800"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          )}

          {confirmState === "confirmDelete" && (
            <div className="space-y-2">
              <span className="text-xs text-red-400">Delete this event?</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="h-7 px-3 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                >
                  {isLoading ? "Deleting..." : "Yes, Delete"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmState("idle")}
                  disabled={isLoading}
                  className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
