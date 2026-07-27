"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Clock, Send, Info, AlertTriangle } from "lucide-react";
import { TIME_OFF_REASONS, computeTimeOffHours } from "@/lib/time-off";

type Reason = (typeof TIME_OFF_REASONS)[number]["value"];

export function TimeOffRequestForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState<Reason | "">("");
  const [reasonDetail, setReasonDetail] = useState("");

  const isOthers = reason === "OTHERS";
  const hours = startTime && endTime ? computeTimeOffHours(startTime, endTime) : null;
  const invalidRange = Boolean(startTime && endTime && hours === null);
  const selectedReason = TIME_OFF_REASONS.find((r) => r.value === reason);

  const canSubmit =
    !isLoading &&
    !!date &&
    !!startTime &&
    !!endTime &&
    hours !== null &&
    !!reason &&
    (!isOthers || reasonDetail.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          reason,
          reasonDetail: isOthers ? reasonDetail.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit time off request");

      toast({
        title: "Time off request submitted",
        description: "Your manager has been notified and will review it.",
      });
      router.push("/time-off");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit time off request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Time Off Request</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-white">Reason for Time Off *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as Reason)} required>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OFF_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReason && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Info className="h-3 w-3 shrink-0" />
                {selectedReason.hint}
              </p>
            )}
          </div>

          {/* Others → free-text detail */}
          {isOthers && (
            <div className="space-y-2">
              <Label htmlFor="reasonDetail" className="text-white">Please specify *</Label>
              <Textarea
                id="reasonDetail"
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white min-h-[90px]"
                placeholder="Describe the reason for your time off..."
                required
              />
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date" className="text-white">Date *</Label>
            <DatePicker id="date" value={date} onChange={(val) => setDate(val)} />
          </div>

          {/* Time range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime" className="text-white">Start Time *</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime" className="text-white">End Time *</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                required
              />
            </div>
          </div>

          {/* Duration readout */}
          <div className="space-y-2">
            <Label className="text-white">Duration</Label>
            <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white text-sm">
              {hours !== null ? `${hours} hour${hours === 1 ? "" : "s"}` : "—"}
            </div>
            {invalidRange && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                End time must be later than start time.
              </p>
            )}
            <p className="text-xs text-gray-500">
              Time off is counted in hours on a single day and does not deduct from your leave balance.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
              className="border-gray-700 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              <Send className="h-4 w-4 mr-2" />
              {isLoading ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
