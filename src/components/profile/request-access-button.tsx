"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Send, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useToast } from "@/hooks/use-toast";

export function RequestAccessButton({ hasPending }: { hasPending: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const todayIso = format(new Date(), "yyyy-MM-dd");

  if (hasPending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded-full px-3 py-1.5">
        <Clock className="h-3.5 w-3.5" />
        Request pending
      </span>
    );
  }

  async function submit() {
    if (fromDate && toDate && toDate < fromDate) {
      toast({ title: "End date must be on or after the start date", variant: "destructive" });
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
      <DialogPrimitive.Trigger asChild>
        <Button size="sm" variant="outline">
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Request access
        </Button>
      </DialogPrimitive.Trigger>
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

          <p className="text-sm text-gray-400 mb-4">
            Ask an admin to send you a building-access invite. Dates and a note are optional — leave
            them blank and the admin will decide.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Access dates (optional)</label>
              <DateRangePicker
                from={fromDate}
                to={toDate}
                onChange={(f, t) => {
                  setFromDate(f);
                  setToDate(t);
                }}
                min={todayIso}
              />
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
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
