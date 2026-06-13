"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Calendar, Send, Upload, X, Info, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { calculateWorkingDays } from "@/lib/utils";

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
}

interface LeaveRequestFormProps {
  leaveTypes: LeaveType[];
  otBalance?: number;
  alEarned?: number;         // AL accrued to today
  alFullAvailable?: number;  // full-year entitlement minus used/pending
  alPersonalEntitlement?: number; // total days entitled this year (for display)
  defaultLeaveTypeCode?: string; // e.g. "MC" to pre-select Medical Leave
  // legacy prop — kept for backwards compat when form is reused elsewhere
  alAvailable?: number;
}

export function LeaveRequestForm({
  leaveTypes,
  otBalance = 0,
  alEarned = 0,
  alFullAvailable = 0,
  alPersonalEntitlement = 12,
  defaultLeaveTypeCode,
  alAvailable,
}: LeaveRequestFormProps) {
  // alEarned falls back to legacy alAvailable prop
  const earnedToday = alEarned ?? alAvailable ?? 0;

  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const defaultLeaveTypeId = defaultLeaveTypeCode
    ? leaveTypes.find((t) => t.code === defaultLeaveTypeCode)?.id ?? ""
    : "";
  const [leaveTypeId, setLeaveTypeId] = useState(defaultLeaveTypeId);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [dayType, setDayType] = useState<"FULL_DAY" | "AM_HALF" | "PM_HALF">("FULL_DAY");
  const [halfDayPosition, setHalfDayPosition] = useState<"first" | "last" | null>(null);
  const [reason, setReason] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [breakdown, setBreakdown] = useState<{ calendarDays: number; weekendDays: number; holidayDays: number } | null>(null);
  const [useOt, setUseOt] = useState(false);
  const [otDaysToUse, setOtDaysToUse] = useState(0);

  const selectedLeaveType = leaveTypes.find((t) => t.id === leaveTypeId);
  const isMC = selectedLeaveType?.code === "MC" || selectedLeaveType?.code === "SL";
  const isAL = selectedLeaveType?.code === "AL";
  const isOT = selectedLeaveType?.code === "AL_OT";

  const isSingleDay = startDate && endDate && startDate === endDate;
  const isMultiDay = startDate && endDate && startDate < endDate;

  const daysNum = parseFloat(days) || 0;

  // True deficit: beyond full-year entitlement
  const deficitBeforeOt = isAL ? Math.max(0, daysNum - alFullAvailable) : 0;
  const effectiveOtUsed = useOt ? Math.min(otDaysToUse, otBalance, daysNum) : 0;
  // Advance AL: within full entitlement but ahead of accrual (after OT offset)
  const advanceDays = isAL ? Math.max(0, Math.min(daysNum, alFullAvailable) - earnedToday - effectiveOtUsed) : 0;
  const deficitDays = isAL ? Math.max(0, deficitBeforeOt - effectiveOtUsed) : 0;
  const fullyWithinEntitlement = isAL && daysNum <= alFullAvailable;
  // Days not yet earned (advance + deficit) — OT can cover any of this
  const nonEarnedDays = isAL ? Math.max(0, daysNum - earnedToday) : 0;

  // Fetch public holidays when start date year changes
  useEffect(() => {
    if (!startDate) return;
    const year = startDate.slice(0, 4);
    fetch(`/api/public-holidays?year=${year}`)
      .then((r) => r.json())
      .then((d) => setPublicHolidays(d.dates ?? []))
      .catch(() => {});
  }, [startDate.slice(0, 4)]);

  // Auto-calculate working days
  useEffect(() => {
    if (!startDate || !endDate) { setDays(""); setBreakdown(null); return; }
    if (startDate > endDate) { setDays(""); setBreakdown(null); return; }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (startDate === endDate) {
      const { workingDays, calendarDays, weekendDays, holidayDays } = calculateWorkingDays(start, end, publicHolidays);
      setBreakdown(workingDays === 0 ? { calendarDays, weekendDays, holidayDays } : null);
      setDays(workingDays === 0 ? "" : (dayType === "FULL_DAY" ? "1" : "0.5"));
    } else {
      const { workingDays, calendarDays, weekendDays, holidayDays } = calculateWorkingDays(start, end, publicHolidays);
      setBreakdown(calendarDays !== workingDays ? { calendarDays, weekendDays, holidayDays } : null);
      const baseWd = halfDayPosition ? workingDays - 0.5 : workingDays;
      setDays(baseWd > 0 ? String(baseWd) : "");
    }
  }, [startDate, endDate, dayType, halfDayPosition, publicHolidays]);

  useEffect(() => {
    if (leaveTypeId && !isAL) { setDayType("FULL_DAY"); setHalfDayPosition(null); }
  }, [leaveTypeId, isAL]);

  useEffect(() => {
    if (startDate && endDate) {
      if (startDate === endDate) setHalfDayPosition(null);
      else setDayType("FULL_DAY");
    }
  }, [startDate, endDate]);

  // Auto-fill OT slider when toggle turns on
  useEffect(() => {
    if (!useOt) { setOtDaysToUse(0); return; }
    // Cover deficit first; if none, cover the advance (non-earned) portion
    const target = deficitBeforeOt > 0 ? deficitBeforeOt : nonEarnedDays;
    setOtDaysToUse(Math.min(target, otBalance));
  }, [useOt, deficitBeforeOt, nonEarnedDays, otBalance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isOT && daysNum > otBalance) {
      toast({ title: "Insufficient Off In Lieu", description: `You only have ${otBalance} Off In Lieu day(s) available.`, variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      let documentUrl: string | undefined;
      let documentFileName: string | undefined;

      if (documentFile) {
        const formData = new FormData();
        formData.append("file", documentFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).error || "Failed to upload document");
        const uploadData = await uploadRes.json();
        documentUrl = uploadData.url;
        documentFileName = uploadData.fileName;
      }

      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId,
          startDate,
          endDate,
          days: daysNum,
          dayType: isSingleDay ? dayType : "FULL_DAY",
          halfDayPosition: isMultiDay ? halfDayPosition : null,
          reason,
          documentUrl,
          documentFileName,
          otDaysUsed: effectiveOtUsed,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit leave request");

      toast({ title: "Leave request submitted", description: "Your request is pending approval." });
      router.push("/leave");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit leave request",
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
            {(["FULL_DAY", "AM_HALF", "PM_HALF"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setDayType(v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${dayType === v ? "bg-primary text-primary-foreground border-primary" : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}>
                {v === "FULL_DAY" ? "Full Day" : v === "AM_HALF" ? "AM Half" : "PM Half"}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {dayType === "AM_HALF" ? "Morning half (e.g. 8am–1pm)" : dayType === "PM_HALF" ? "Afternoon half (e.g. 1pm–6pm)" : "Full working day"}
          </p>
        </div>
      );
    }

    if (isMultiDay) {
      return (
        <div className="space-y-2">
          <Label className="text-white">Include a half-day?</Label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setHalfDayPosition(halfDayPosition ? null : "first")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${halfDayPosition ? "bg-primary text-primary-foreground border-primary" : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}>
              {halfDayPosition ? "Yes" : "No — all full days"}
            </button>
          </div>
          {halfDayPosition && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(["first", "last"] as const).map((pos) => (
                <button key={pos} type="button" onClick={() => setHalfDayPosition(pos)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${halfDayPosition === pos ? "bg-primary text-primary-foreground border-primary" : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}>
                  Half on {pos} day ({pos === "first" ? startDate : endDate})
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const renderAlBalancePanel = () => {
    if (!isAL || !days) return null;

    return (
      <div className="space-y-3">
        {/* Balance Summary */}
        <div className="bg-gray-900 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Leave Balance Summary</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-500">Earned to Date</p>
              <p className={`text-base font-bold ${earnedToday >= daysNum ? "text-green-400" : "text-amber-400"}`}>
                {earnedToday.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Full Entitlement</p>
              <p className="text-base font-bold text-cyan-400">{alPersonalEntitlement}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Off In Lieu Available</p>
              <p className="text-base font-bold text-emerald-400">{otBalance}</p>
            </div>
          </div>
        </div>

        {/* OT Toggle — show whenever AL is selected and OT balance exists */}
        {isAL && otBalance > 0 && nonEarnedDays > 0 && (
          <div className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2.5">
            <div>
              <p className="text-sm text-white font-medium">Use Off In Lieu days for this request</p>
              <p className="text-xs text-gray-500">
                {otBalance} Off In Lieu day(s) available
                {deficitBeforeOt > 0
                  ? ` — offset the ${deficitBeforeOt} day deficit`
                  : ` — cover advance leave ahead of accrual`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUseOt(!useOt)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${useOt ? "bg-emerald-600" : "bg-gray-700"}`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${useOt ? "translate-x-5" : "translate-x-1"}`} />
            </button>
          </div>
        )}

        {/* OT amount slider */}
        {useOt && isAL && otBalance > 0 && nonEarnedDays > 0 && (
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-emerald-300 text-xs">Off In Lieu days to use</Label>
              <span className="text-emerald-400 font-bold text-sm">{otDaysToUse} day(s)</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.min(otBalance, nonEarnedDays)}
              step={0.5}
              value={otDaysToUse}
              onChange={(e) => setOtDaysToUse(parseFloat(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0</span>
              <span>{Math.min(otBalance, nonEarnedDays)}</span>
            </div>
          </div>
        )}

        {/* Breakdown panel */}
        {daysNum > 0 && (
          <div className={`rounded-lg p-3 border space-y-1.5 text-xs ${
            deficitDays > 0 ? "bg-red-950/20 border-red-800/40"
            : advanceDays > 0 ? "bg-amber-950/20 border-amber-800/40"
            : "bg-green-950/20 border-green-800/40"
          }`}>
            {/* Earned portion */}
            {Math.min(earnedToday, daysNum) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Already earned (accrued):</span>
                <span className="text-white font-medium">{Math.min(earnedToday, daysNum).toFixed(1)} day(s)</span>
              </div>
            )}
            {/* Advance portion (within entitlement, not yet accrued) */}
            {advanceDays > 0 && (
              <div className="flex justify-between">
                <span className="text-amber-400 font-medium">Advance (within entitlement):</span>
                <span className="text-amber-400 font-bold">{advanceDays.toFixed(1)} day(s)</span>
              </div>
            )}
            {/* OT used portion */}
            {effectiveOtUsed > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Off In Lieu days used:</span>
                <span className="text-emerald-400 font-medium">{effectiveOtUsed} day(s)</span>
              </div>
            )}
            {/* True deficit */}
            {deficitDays > 0 && (
              <div className="flex justify-between">
                <span className="text-red-400 font-medium">Deficit (beyond entitlement):</span>
                <span className="text-red-400 font-bold">{deficitDays.toFixed(1)} day(s)</span>
              </div>
            )}

            {/* Notes */}
            {advanceDays > 0 && deficitDays === 0 && (
              <div className="flex items-start gap-1.5 text-amber-300 pt-1">
                <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  {advanceDays.toFixed(1)} day(s) are within your {alPersonalEntitlement}-day entitlement but not yet accrued.
                  These will be earned over your remaining service months.
                </span>
              </div>
            )}
            {deficitDays > 0 && (
              <div className="flex items-start gap-1.5 text-red-300 pt-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  {deficitDays.toFixed(1)} day(s) exceed your full entitlement. These will be recorded as a deficit, offset by future Off In Lieu days earned from weekend/holiday work.
                </span>
              </div>
            )}
            {fullyWithinEntitlement && advanceDays === 0 && deficitDays === 0 && (
              <div className="flex items-center gap-1.5 text-green-300 pt-1">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span>
                  {effectiveOtUsed > 0
                    ? `Covered by earned AL + ${effectiveOtUsed} Off In Lieu day(s).`
                    : "Fully covered by your earned AL balance."}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const leaveTypeLabel = (type: LeaveType) => {
    if (type.code === "AL_OT") return `${type.name} (${otBalance} days available)`;
    if (type.code === "AL") return `${type.name} (${earnedToday} days available)`;
    if (type.defaultDays > 0) return `${type.name} (${type.defaultDays} days/year)`;
    return type.name;
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Leave Application</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="leaveType" className="text-white">Leave Type *</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId} required>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {leaveTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOT && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <Info className="h-3 w-3" />
                You have <span className="font-semibold">{otBalance}</span> Off In Lieu day(s) earned from weekend/public holiday work.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-white">Start Date *</Label>
              <DatePicker id="startDate" value={startDate} onChange={(val) => setStartDate(val)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-white">End Date *</Label>
              <DatePicker id="endDate" value={endDate} onChange={(val) => setEndDate(val)} min={startDate} />
            </div>
          </div>

          {isAL && renderDayTypeSelector()}

          <div className="space-y-2">
            <Label className="text-white">Number of Working Days</Label>
            <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white text-sm">
              {days || "—"} {days ? (Number(days) === 1 ? "working day" : "working days") : ""}
            </div>
            {breakdown && breakdown.calendarDays > 0 && (
              <p className="text-xs text-blue-400 flex items-center gap-1">
                <Info className="h-3 w-3 shrink-0" />
                {breakdown.calendarDays} calendar day{breakdown.calendarDays !== 1 ? "s" : ""} →{" "}
                {days || "0"} working day{Number(days) !== 1 ? "s" : ""}
                {breakdown.weekendDays > 0 && ` (${breakdown.weekendDays} weekend${breakdown.weekendDays !== 1 ? "s" : ""} skipped)`}
                {breakdown.holidayDays > 0 && `, ${breakdown.holidayDays} public holiday${breakdown.holidayDays !== 1 ? "s" : ""} skipped`}
              </p>
            )}
            {startDate && endDate && !days && (
              <p className="text-xs text-amber-400">Selected date(s) fall on weekends or public holidays — no working days.</p>
            )}
            <p className="text-xs text-gray-500">Weekends and Singapore public holidays are automatically excluded.</p>
          </div>

          {isOT && days && parseFloat(days) > otBalance && (
            <div className="bg-red-950/30 border border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-400">Insufficient Off In Lieu balance. Available: {otBalance} day(s).</p>
            </div>
          )}

          {/* AL balance panel */}
          {renderAlBalancePanel()}

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-white">Reason (optional)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white min-h-[100px]" placeholder="Enter reason for leave..." />
          </div>

          {isMC && (
            <div className="space-y-2">
              <Label className="text-white">Medical Certificate / Doctor&apos;s Evidence *</Label>
              {documentFile ? (
                <div className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg">
                  <Upload className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-300 truncate flex-1">{documentFile.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDocumentFile(null)} className="text-gray-400 hover:text-white">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <input type="file" accept="image/*,.pdf" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg hover:border-gray-500 transition-colors">
                    <Upload className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-400">Upload MC document (Image or PDF, max 5MB)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading} className="border-gray-700 hover:bg-gray-800">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !leaveTypeId || !startDate || !endDate || !days || parseFloat(days) < 0.5 || (isOT && parseFloat(days) > otBalance)}
            >
              <Send className="h-4 w-4 mr-2" />
              {isLoading ? "Submitting..." : deficitDays > 0 ? `Submit with ${deficitDays.toFixed(1)}d deficit` : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
