"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Send, Loader2, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useToast } from "@/hooks/use-toast";
import {
  DATE_PRESETS,
  FROM_TIME,
  MAX_PENDING_REQUESTS,
  MAX_WINDOW_DAYS,
  TO_TIME,
  presetRange,
  windowDaysInclusive,
} from "@/lib/woods-square";

export function RequestAccessButton({ pendingCount = 0 }: { pendingCount?: number }) {
  const router = useRouter();
  const atLimit = pendingCount >= MAX_PENDING_REQUESTS;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const applyPreset = (fromOffset: number, toOffset: number) => {
    const { from, to } = presetRange(fromOffset, toOffset);
    setFromDate(from);
    setToDate(to);
  };

  const windowDays = windowDaysInclusive(fromDate, toDate);
  const overWindow = windowDays > MAX_WINDOW_DAYS;

  async function submit() {
    if (fromDate && toDate && toDate < fromDate) {
      toast({ title: "End date must be on or after the start date", variant: "destructive" });
      return;
    }
    if (overWindow) {
      toast({
        title: "Window too long",
        description: `Woods Square allows up to ${MAX_WINDOW_DAYS} days.`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/woods-square/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn’t send request", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Request sent", description: "An admin has been notified." });
      setOpen(false);
      setFromDate("");
      setToDate("");
      setNote("");
      router.refresh();
    } catch (err) {
      toast({
        title: "Request error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="flex flex-col items-end gap-1">
        <DialogPrimitive.Trigger asChild>
          <Button
            size="sm"
            disabled={atLimit}
            title={atLimit ? `You already have ${MAX_PENDING_REQUESTS} pending requests` : undefined}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Request access
          </Button>
        </DialogPrimitive.Trigger>
        {atLimit && (
          <span className="text-[11px] text-amber-400/90">
            Max {MAX_PENDING_REQUESTS} pending requests reached
          </span>
        )}
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-md bg-gray-950 border border-gray-800 rounded-xl p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-base font-semibold flex items-center gap-2">
              <Send className="h-4 w-4 text-indigo-400" />
              Request Woods Square Access
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-gray-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <p className="text-sm text-gray-400 mb-3">
            Ask an admin to send you a building-access invite. Dates and a note are optional — leave
            them blank and the admin will decide.
          </p>

          <div className="flex items-start gap-2 rounded-lg border border-violet-900/40 bg-violet-950/20 px-3 py-2 mb-4">
            <CalendarRange className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-300">
              Each access window can be up to{" "}
              <span className="font-medium text-white">1 week ({MAX_WINDOW_DAYS} days)</span> — for a
              longer stay, send another request.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                <CalendarRange className="h-3.5 w-3.5" />
                Access window (optional)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.from, p.to)}
                    className="text-xs text-gray-300 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-full px-2.5 py-1 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <DateRangePicker
                from={fromDate}
                to={toDate}
                onChange={(f, t) => {
                  setFromDate(f);
                  setToDate(t);
                }}
                min={todayIso}
              />
              {windowDays > 0 && (
                <p className={`text-xs ${overWindow ? "text-red-400" : "text-gray-500"}`}>
                  {overWindow
                    ? `${windowDays}-day window exceeds the ${MAX_WINDOW_DAYS}-day limit — shorten it.`
                    : `${windowDays}-day window · each day ${FROM_TIME}–${TO_TIME}.`}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="e.g. client visit, working onsite this week…"
                className="w-full bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <Button onClick={submit} disabled={submitting || overWindow}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
