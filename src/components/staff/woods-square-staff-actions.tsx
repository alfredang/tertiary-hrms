"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  differenceInCalendarDays,
  format,
  isValid,
  parse,
} from "date-fns";
import { Mail, Send, Loader2, CalendarRange } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useToast } from "@/hooks/use-toast";
import {
  DATE_PRESETS,
  FROM_TIME,
  HABITAP_DATE_FMT,
  MAX_WINDOW_DAYS,
  TO_TIME,
  presetRange,
  windowDaysInclusive,
} from "@/lib/woods-square";

/** The pass window ("dd MMM yyyy" strings) the Resend action re-issues. */
export interface CurrentPass {
  fromDate: string;
  toDate: string;
}

interface Props {
  employeeId: string;
  employeeName: string;
  email: string;
  /** The current/most-relevant pass (same one shown on the page), or null if none. */
  currentPass: CurrentPass | null;
}

/** "dd MMM yyyy" → Date. */
function parseHabitap(d: string): Date {
  return parse(d, HABITAP_DATE_FMT, new Date());
}

/** True once an invite's end date is fully in the past (resending it is pointless). */
function windowEnded(toDate: string): boolean {
  const d = parseHabitap(toDate);
  if (!isValid(d)) return false;
  return differenceInCalendarDays(new Date(), d) > 0;
}

/**
 * The window a resend should use. A pass may have started before today, but neither
 * the date picker nor Habitap accepts a past start — so resend covers the remaining
 * days: start clamped up to today, original end kept.
 */
function resendWindow(pass: CurrentPass): { fromDate: string; toDate: string } {
  const origFrom = parseHabitap(pass.fromDate);
  const startedInPast = isValid(origFrom) && differenceInCalendarDays(new Date(), origFrom) > 0;
  const fromDate = startedInPast ? format(new Date(), HABITAP_DATE_FMT) : pass.fromDate;
  return { fromDate, toDate: pass.toDate };
}

/** yyyy-MM-dd (picker format) → "dd MMM yyyy" (Habitap format). */
function isoToHabitap(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), HABITAP_DATE_FMT);
}

export function WoodsSquareStaffActions({ employeeId, employeeName, email, currentPass }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const [submitting, setSubmitting] = useState(false);

  // Send-invite dialog (pick a window, then send to just this person).
  const [sendOpen, setSendOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Resend dialog (re-issue the latest still-valid invite).
  const [resendOpen, setResendOpen] = useState(false);
  const canResend = currentPass !== null && !windowEnded(currentPass.toDate);

  const windowDays = windowDaysInclusive(startDate, endDate);
  const overWindow = windowDays > MAX_WINDOW_DAYS;
  const canSend = !!startDate && !!endDate && !overWindow && !submitting;

  const applyPreset = (fromOffset: number, toOffset: number) => {
    const { from, to } = presetRange(fromOffset, toOffset);
    setStartDate(from);
    setEndDate(to);
  };

  // Shared POST for both actions.
  async function postInvite(window: { fromDate: string; toDate: string }, resend: boolean) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/habitap/generate-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffIds: [employeeId],
          resend,
          window: {
            fromDate: window.fromDate,
            fromTime: FROM_TIME,
            toDate: window.toDate,
            toTime: TO_TIME,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: resend ? "Couldn’t resend PIN" : "Couldn’t send invite",
          description: data.error,
          variant: "destructive",
        });
        return false;
      }
      if ((data.invitedCount ?? 0) > 0) {
        toast({
          title: resend ? "PIN resent" : "Invite sent",
          description: `${employeeName} was emailed ${resend ? "a fresh entry PIN" : "their entry PIN"}.`,
        });
        router.refresh(); // pull the new row into the history table
        return true;
      }
      // Nothing went out — surface why (a same-window send may be deduped).
      toast({
        title: resend ? "Couldn’t resend PIN" : "Nothing sent",
        description:
          data.failed?.[0]?.error ??
          (data.skippedCount > 0
            ? "They already have an invite covering these dates."
            : "No invite went out — try again."),
        variant: "destructive",
      });
      return false;
    } catch (err) {
      toast({
        title: resend ? "Couldn’t resend PIN" : "Couldn’t send invite",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    const ok = await postInvite(
      { fromDate: isoToHabitap(startDate), toDate: isoToHabitap(endDate) },
      false,
    );
    if (ok) {
      setSendOpen(false);
      setStartDate("");
      setEndDate("");
    }
  }

  async function handleResend() {
    if (!currentPass) return;
    const ok = await postInvite(resendWindow(currentPass), true);
    if (ok) setResendOpen(false);
  }

  const effectiveResend = currentPass ? resendWindow(currentPass) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canResend && (
          <Button variant="outline" onClick={() => setResendOpen(true)} disabled={submitting}>
            <Mail className="h-4 w-4 mr-1.5" />
            Resend PIN
          </Button>
        )}
        <Button onClick={() => setSendOpen(true)} disabled={submitting}>
          <Send className="h-4 w-4 mr-1.5" />
          Send invite
        </Button>
      </div>

      {/* Send-invite dialog — pick a window, then send to this one person. */}
      <DialogPrimitive.Root
        open={sendOpen}
        onOpenChange={(open) => {
          if (!submitting) setSendOpen(open);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-800 bg-gray-950 p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <Send className="h-4 w-4 text-indigo-400" />
              Send building-access invite
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-gray-400">
              Pick the access window for{" "}
              <span className="font-medium text-gray-200">{employeeName}</span>. They&rsquo;ll be
              emailed their entry PIN. This can&rsquo;t be undone.
            </DialogPrimitive.Description>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                <CalendarRange className="h-3.5 w-3.5" />
                Access window
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
                from={startDate}
                to={endDate}
                onChange={(f, t) => {
                  setStartDate(f);
                  setEndDate(t);
                }}
                min={todayIso}
              />
              {windowDays > 0 ? (
                <p className={`text-xs ${overWindow ? "text-red-400" : "text-gray-500"}`}>
                  {overWindow
                    ? `${windowDays}-day window exceeds the ${MAX_WINDOW_DAYS}-day limit — shorten it.`
                    : `${windowDays}-day window · each day ${FROM_TIME}–${TO_TIME}.`}
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Each day runs {FROM_TIME}–{TO_TIME}. Up to a {MAX_WINDOW_DAYS}-day window.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => setSendOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!canSend} onClick={handleSend}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {submitting ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Resend dialog — re-issue the latest still-valid invite. */}
      <DialogPrimitive.Root
        open={resendOpen}
        onOpenChange={(open) => {
          if (!submitting) setResendOpen(open);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-800 bg-gray-950 p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <Mail className="h-4 w-4 text-indigo-400" />
              Resend entry PIN
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-gray-400">
              Email <span className="font-medium text-gray-200">{employeeName}</span> a fresh
              building-access PIN for the dates below? Use this if they lost the original email.
            </DialogPrimitive.Description>
            {effectiveResend ? (
              <p className="mt-2 text-xs text-gray-500">
                {effectiveResend.fromDate} – {effectiveResend.toDate} · {email}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => setResendOpen(false)}>
                Cancel
              </Button>
              <Button disabled={submitting} onClick={handleResend}>
                {submitting ? "Resending…" : "Resend PIN"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
