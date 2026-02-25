"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Send, Upload, X } from "lucide-react";

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
}

interface LeaveRequestFormProps {
  leaveTypes: LeaveType[];
}

function calculateBusinessDays(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (endDate < startDate) return 0;

  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return Math.max(count, 0.5);
}

export function LeaveRequestForm({ leaveTypes }: LeaveRequestFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const selectedLeaveType = leaveTypes.find((t) => t.id === leaveTypeId);
  const isMC = selectedLeaveType?.code === "MC" || selectedLeaveType?.code === "SL";

  // Auto-calculate days when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const calculated = calculateBusinessDays(startDate, endDate);
      setDays(String(calculated));
    }
  }, [startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let documentUrl: string | undefined;
      let documentFileName: string | undefined;

      // Upload MC document if provided
      if (documentFile) {
        const formData = new FormData();
        formData.append("file", documentFile);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadError = await uploadRes.json();
          throw new Error(uploadError.error || "Failed to upload document");
        }

        const uploadData = await uploadRes.json();
        documentUrl = uploadData.url;
        documentFileName = uploadData.fileName;
      }

      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveTypeId, startDate, endDate, days: parseFloat(days), reason, documentUrl, documentFileName }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit leave request");
      }

      toast({
        title: "Leave request submitted",
        description: "Your request is pending approval.",
      });

      router.push("/leave");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to submit leave request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Leave Application</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="leaveType" className="text-white">
              Leave Type *
            </Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId} required>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} ({type.defaultDays} days/year)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-white">
                Start Date *
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-white">
                End Date *
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                min={startDate}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="days" className="text-white">
              Number of Days *
            </Label>
            <Input
              id="days"
              type="number"
              min="0.5"
              step="0.5"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white"
              placeholder="Auto-calculated from dates"
              required
            />
            <p className="text-xs text-gray-500">Auto-calculated from dates. Adjust for half-day leave (min 0.5 days).</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-white">
              Reason (optional)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white min-h-[100px]"
              placeholder="Enter reason for leave..."
            />
          </div>

          {/* MC / Doctor's Evidence Upload */}
          {isMC && (
            <div className="space-y-2">
              <Label className="text-white">
                Medical Certificate / Doctor&apos;s Evidence *
              </Label>
              {documentFile ? (
                <div className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg">
                  <Upload className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-300 truncate flex-1">
                    {documentFile.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDocumentFile(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) =>
                      setDocumentFile(e.target.files?.[0] || null)
                    }
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg hover:border-gray-500 transition-colors">
                    <Upload className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-400">
                      Upload MC document (Image or PDF, max 5MB)
                    </span>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Please attach the doctor&apos;s medical certificate or evidence for sick leave.
              </p>
            </div>
          )}

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
            <Button type="submit" disabled={isLoading || !leaveTypeId || !startDate || !endDate || !days || parseFloat(days) < 0.5}>
              <Send className="h-4 w-4 mr-2" />
              {isLoading ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
