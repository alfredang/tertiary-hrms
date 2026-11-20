"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Send, Info, AlertTriangle } from "lucide-react";
import { dayCountLabel, isOffDayFor, prettyDay } from "@/lib/npl-payback";

export interface PayableDay {
  /** YYYY-MM-DD */
  date: string;
  /** Days of this No Pay Leave day still open to pay back: 1 or 0.5. */
  outstanding: number;
  reason: string | null;
}

export function PaybackRequestForm({
  days: payable,
  workdays,
  holidays,
  offDayNames,
  npl,
  initialDate,
}: {
  days: PayableDay[];
  workdays: number[];
  /** Public holidays (YYYY-MM-DD), which also count as off days. */
  holidays: string[];
  /** e.g. ["Sat", "Sun"] */
  offDayNames: string[];
  npl: { remaining: number; cap: number };
  initialDate?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [nplDate, setNplDate] = useState(payable.some((d) => d.date === initialDate) ? initialDate! : payable.length === 1 ? payable[0].date : "");
  const [workDate, setWorkDate] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");

  const chosen = payable.find((d) => d.date === nplDate);
  // A half-day No Pay Leave can only be paid back with a half day.
  const days = chosen && chosen.outstanding < 1 ? 0.5 : Number(amount);
  const holidaySet = new Set(holidays);
  const notOffDay = !!workDate && !isOffDayFor(workdays, workDate, holidaySet);
  const wrongYear = !!workDate && !!chosen && workDate.slice(0, 4) !== chosen.date.slice(0, 4);
  const canSubmit = !isLoading && !!chosen && !!workDate && !notOffDay && !wrongYear;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/leave/payback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nplDate, workDate, days, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit payback request");
      toast({ title: "Payback request submitted", description: "Your manager has been notified and will review it." });
      router.push("/leave/payback");
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to submit payback request", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (payable.length === 0) {
    return (
      <Card className="bg-gray-950 border-gray-800 w-full">
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-white font-medium">You have no No Pay Leave to pay back.</p>
          <p className="text-sm text-gray-400 allow-wrap">
            Only approved No Pay Leave days from this year that are not already paid back (or waiting for approval) can be paid back.
          </p>
          <Button type="button" variant="outline" onClick={() => router.push("/leave/payback")} className="border-gray-700 hover:bg-gray-800">
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Pay Back No Pay Leave</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-white">No Pay Leave day to pay back *</Label>
            <Select value={nplDate} onValueChange={setNplDate} required>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select a No Pay Leave day" />
              </SelectTrigger>
              <SelectContent>
                {payable.map((d) => (
                  <SelectItem key={d.date} value={d.date}>
                    {prettyDay(d.date)} · {dayCountLabel(d.outstanding)}
                    {d.reason ? ` · ${d.reason.slice(0, 40)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workDate" className="text-white">Off day you worked *</Label>
            <DatePicker id="workDate" value={workDate} onChange={(val) => setWorkDate(val)} />
            <p className="text-xs text-gray-500 flex items-center gap-1 allow-wrap">
              <Info className="h-3 w-3 shrink-0" />
              Your off days: {offDayNames.length ? offDayNames.join(", ") : "none in the week"} and public holidays.
            </p>
            {notOffDay && (
              <p className="text-xs text-red-400 flex items-center gap-1 allow-wrap">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {prettyDay(workDate)} is one of your normal working days. Choose one of your off days or a public holiday.
              </p>
            )}
            {wrongYear && (
              <p className="text-xs text-red-400 flex items-center gap-1 allow-wrap">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                The off day must be in the same year as the No Pay Leave.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-white">Worked</Label>
            {chosen && chosen.outstanding < 1 ? (
              <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white text-sm">Half day</div>
            ) : (
              <Select value={amount} onValueChange={setAmount}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Full day (pays back 1 day)</SelectItem>
                  <SelectItem value="0.5">Half day (pays back half a day)</SelectItem>
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-gray-500 allow-wrap">
              Once approved, your No Pay Leave balance goes from {npl.remaining} of {npl.cap} left to{" "}
              {Math.min(npl.cap, npl.remaining + days)} of {npl.cap} left.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note" className="text-white">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="bg-gray-900 border-gray-700 text-white min-h-[80px]"
              placeholder="What you worked on that day..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading} className="border-gray-700 hover:bg-gray-800">
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
