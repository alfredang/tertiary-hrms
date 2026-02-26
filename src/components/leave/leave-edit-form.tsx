"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Send, Upload, X } from "lucide-react";

interface LeaveEditFormProps {
  leaveId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  initialData: {
    startDate: string; // "YYYY-MM-DD"
    endDate: string;
    reason: string;
    documentUrl: string | null;
    documentFileName: string | null;
    dayType: string;
    halfDayPosition: string | null;
  };
}

export function LeaveEditForm({ leaveId, leaveTypeName, leaveTypeCode, initialData }: LeaveEditFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [endDate, setEndDate] = useState(initialData.endDate);
  const [days, setDays] = useState("");
  const [dayType, setDayType] = useState<"FULL_DAY" | "AM_HALF" | "PM_HALF">(
    (initialData.dayType as "FULL_DAY" | "AM_HALF" | "PM_HALF") || "FULL_DAY"
  );
  const [halfDayPosition, setHalfDayPosition] = useState<"first" | "last" | null>(
    (initialData.halfDayPosition as "first" | "last" | null) || null
  );
  const [reason, setReason] = useState(initialData.reason);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [existingDocumentFileName, setExistingDocumentFileName] = useState(initialData.documentFileName);
  const [removeDocument, setRemoveDocument] = useState(false);

  const isAL = leaveTypeCode === "AL";
  const isSingleDay = startDate && endDate && startDate === endDate;
  const isMultiDay = startDate && endDate && startDate < endDate;

  // Auto-calculate days when dates, dayType, or halfDayPosition change
  useEffect(() => {
    if (startDate && endDate) {
      if (startDate === endDate) {
        setDays(dayType === "FULL_DAY" ? "1" : "0.5");
      } else if (startDate < endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (halfDayPosition) {
          setDays(String(totalDays - 0.5));
        } else {
          setDays(String(totalDays));
        }
      } else {
        setDays("");
      }
    }
  }, [startDate, endDate, dayType, halfDayPosition]);

  // Reset dayType/halfDayPosition when switching between single/multi day
  useEffect(() => {
    if (startDate && endDate) {
      if (startDate === endDate) {
        setHalfDayPosition(null);
      } else {
        setDayType("FULL_DAY");
      }
    }
  }, [startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let documentUrl: string | undefined;
      let documentFileName: string | undefined;

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

      const res = await fetch(`/api/leave/${leaveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          days: parseFloat(days),
          dayType: isSingleDay ? dayType : "FULL_DAY",
          halfDayPosition: isMultiDay ? halfDayPosition : null,
          reason,
          ...(documentUrl
            ? { documentUrl, documentFileName }
            : removeDocument
              ? { documentUrl: null, documentFileName: null }
              : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update leave request");
      }

      toast({
        title: "Leave request updated",
        description: "Your changes have been saved.",
      });

      router.push("/leave");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update leave request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderDayTypeSelector = () => {
    if (!startDate || !endDate) return null;

    if (isSingleDay) {
      return (
        <div className="space-y-2">
          <Label className="text-white">Day Type *</Label>
          <div className="flex gap-2">
            {([
              { value: "FULL_DAY" as const, label: "Full Day" },
              { value: "AM_HALF" as const, label: "AM Half" },
              { value: "PM_HALF" as const, label: "PM Half" },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDayType(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  dayType === option.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {dayType === "AM_HALF" ? "Morning half (e.g. 8am–1pm)" :
             dayType === "PM_HALF" ? "Afternoon half (e.g. 1pm–6pm)" :
             "Full working day"}
          </p>
        </div>
      );
    }

    if (isMultiDay) {
      return (
        <div className="space-y-2">
          <Label className="text-white">Include a half-day?</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHalfDayPosition(halfDayPosition ? null : "first")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                halfDayPosition
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"
              }`}
            >
              {halfDayPosition ? "Yes" : "No — all full days"}
            </button>
          </div>
          {halfDayPosition && (
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => setHalfDayPosition("first")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  halfDayPosition === "first"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"
                }`}
              >
                Half on first day ({startDate})
              </button>
              <button
                type="button"
                onClick={() => setHalfDayPosition("last")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  halfDayPosition === "last"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"
                }`}
              >
                Half on last day ({endDate})
              </button>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Edit Leave Request</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Leave type is read-only — cannot be changed after submission */}
          <div className="space-y-2">
            <Label className="text-white">Leave Type</Label>
            <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-400 text-sm">
              {leaveTypeName} <span className="text-gray-600 text-xs">(cannot be changed)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-white">
                Start Date *
              </Label>
              <DatePicker
                id="startDate"
                value={startDate}
                onChange={(val) => setStartDate(val)}
                placeholder="Start date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-white">
                End Date *
              </Label>
              <DatePicker
                id="endDate"
                value={endDate}
                onChange={(val) => setEndDate(val)}
                min={startDate}
                placeholder="End date"
              />
            </div>
          </div>

          {isAL && renderDayTypeSelector()}

          <div className="space-y-2">
            <Label className="text-white">Number of Days</Label>
            <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white text-sm">
              {days || "—"} {days ? (Number(days) === 1 ? "day" : "days") : ""}
            </div>
            <p className="text-xs text-gray-500">Auto-calculated from dates and day type.</p>
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

          {/* Document upload — show existing file name if any */}
          <div className="space-y-2">
            <Label className="text-white">Supporting Document (optional)</Label>
            {existingDocumentFileName && !documentFile && !removeDocument && (
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate flex-1">Current: {existingDocumentFileName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setRemoveDocument(true); setExistingDocumentFileName(null); }}
                  className="text-gray-400 hover:text-red-400 shrink-0"
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 text-xs">Remove</span>
                </Button>
              </div>
            )}
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
                  onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg hover:border-gray-500 transition-colors">
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-400">
                    {existingDocumentFileName && !removeDocument ? "Replace document" : "Upload document"} (Image or PDF, max 5MB)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/leave")}
              disabled={isLoading}
              className="border-gray-700 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !startDate || !endDate || !days || parseFloat(days) < 0.5}
            >
              <Send className="h-4 w-4 mr-2" />
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
