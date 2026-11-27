"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { prettyDay } from "@/lib/npl-payback";

/**
 * Ask to use one day of annual leave for an approved No Pay Leave day (src/lib/npl-to-al.ts). It is
 * an annual leave request that goes to the approvers; the No Pay Leave changes only once approved.
 */
export function UseAlForNplButton({ date, alLeaveTypeId }: { date: string; alLeaveTypeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!confirm(
      `Use 1 day of annual leave for your No Pay Leave on ${prettyDay(date)}?\n\n` +
      "This sends an annual leave request for approval. Once approved, the day comes off your No Pay Leave.",
    )) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveTypeId: alLeaveTypeId, startDate: date, endDate: date, days: 1, dayType: "FULL_DAY", coversNpl: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the request");
      toast({ title: "Sent for approval", description: `Annual leave for ${prettyDay(date)} is waiting for approval.` });
      router.refresh();
    } catch (err) {
      toast({ title: "Not sent", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={submit}
      disabled={busy}
      className="h-8 border-emerald-600 bg-transparent text-xs sm:text-sm text-emerald-400 hover:bg-emerald-600 hover:text-on-color"
    >
      {busy ? "Sending…" : "Use annual leave"}
    </Button>
  );
}
