"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarClock, Plug, CheckCircle2, XCircle, Loader2, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { lastMondayOfMonth, monthWindows, upcomingMonthOf } from "@/lib/woods-square";
import { WoodsSquareHealthBanner } from "@/components/staff/woods-square-health-banner";
import { WoodsSquareManageList, Toggle, type ManageStaff } from "@/components/staff/woods-square-manage-list";
import type { ScheduleConfig } from "@/lib/woods-square-schedule";

/** Next "last Monday of the month" from now, for the production next-run display. */
function nextRunDate(now: Date): Date {
  const thisMonth = lastMondayOfMonth(now.getFullYear(), now.getMonth());
  return thisMonth >= now ? thisMonth : lastMondayOfMonth(now.getFullYear(), now.getMonth() + 1);
}

/** ISO instant → value for a <input type="datetime-local"> (local wall-clock). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

/** datetime-local value for the saved fire time — blank if missing or already elapsed (SGT). */
function futureFireAt(iso: string | null): string {
  const v = isoToLocalInput(iso);
  return v && v >= nowInSingapore() ? v : "";
}

/** Current Singapore wall-clock as a <input type="datetime-local"> min value (yyyy-MM-ddTHH:mm). */
function nowInSingapore(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Seconds → "M:SS" for the live elapsed timer on the run overlay. */
function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WoodsSquareSettings({
  manageStaff,
  scheduleConfig,
}: {
  manageStaff: ManageStaff[];
  scheduleConfig: ScheduleConfig;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [enabled, setEnabled] = useState(scheduleConfig.enabled);
  const [testMode, setTestMode] = useState(scheduleConfig.testMode);
  const [testRecipientIds, setTestRecipientIds] = useState<string[]>(scheduleConfig.testRecipientIds ?? []);
  const [fireAt, setFireAt] = useState(() => futureFireAt(scheduleConfig.testFireAt));

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [conn, setConn] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const onListStaff = manageStaff.filter((s) => s.onList);
  const run = nextRunDate(new Date());
  const daysUntil = differenceInCalendarDays(run, new Date());

  // Next month is split into weekly windows; each window is one Habitap browser pass,
  // so the window count drives the "how long" estimate shown on the run overlay.
  const upcoming = upcomingMonthOf(new Date());
  const windowCount = monthWindows(upcoming.year, upcoming.monthIndex).length;

  // Live elapsed-seconds counter while a "Run now" is in flight.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  /** Accept the picked time only if it's now-or-later in Singapore; otherwise snap to now. */
  const onFireAtChange = (value: string) => {
    if (!value) {
      setFireAt("");
      return;
    }
    const min = nowInSingapore();
    if (value < min) {
      setFireAt(min);
      toast({
        title: "Can’t fire in the past",
        description: "Snapped to the current Singapore time — pick a later moment.",
        variant: "destructive",
      });
      return;
    }
    setFireAt(value);
  };
  const toggleTestRecipient = (id: string) =>
    setTestRecipientIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function save() {
    setSaving(true);
    try {
      // A past/elapsed "Fire at" is saved as null (cleared), not rejected — the picker already
      // stops you choosing a past time, so auto-save never needs to error on a stale one.
      const validFireAt = fireAt && fireAt >= nowInSingapore() ? fireAt : null;
      const res = await fetch("/api/woods-square/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          testMode,
          testRecipientIds,
          testFireAt: validFireAt ? new Date(validFireAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Couldn’t save", description: data.error, variant: "destructive" });
        return;
      }
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn’t save",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Auto-save only when something ACTUALLY changed from the loaded config — so it never
  // fires on page load (which would otherwise re-save a possibly-stale fire time and pop a
  // spurious "pick a future time" error). The fire-time comparison uses the same input-string
  // form on both sides, so it's not falsely "dirty".
  const initialFireAt = futureFireAt(scheduleConfig.testFireAt);
  // Canonicalise the live fire time the same way (a past/elapsed time ≡ blank) so the dirty
  // check never flips just because the chosen time passed while the page sat open.
  const canonFireAt = fireAt && fireAt >= nowInSingapore() ? fireAt : "";
  const scheduleDirty =
    enabled !== scheduleConfig.enabled ||
    testMode !== scheduleConfig.testMode ||
    testRecipientIds.join("|") !== (scheduleConfig.testRecipientIds ?? []).join("|") ||
    canonFireAt !== initialFireAt;
  useEffect(() => {
    if (!scheduleDirty) return;
    const t = setTimeout(() => {
      void save();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleDirty]);

  async function runNow() {
    // This fires REAL building PINs — confirm clearly, and spell out the blast radius.
    const msg = testMode
      ? `Send a TEST invite now to ${testRecipientIds.length} ${testRecipientIds.length === 1 ? "person" : "people"}? ` +
        `This emails next month's real building PIN(s) to just them.`
      : `Send next month's invites to ALL ${onListStaff.length} people on the list RIGHT NOW? ` +
        `This emails real building PINs to everyone on the Woods Square list.`;
    if (!window.confirm(msg)) return;

    setRunning(true);
    try {
      // Run exactly what's on screen: persist the current settings first, then fire.
      const saveRes = await fetch("/api/woods-square/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          testMode,
          testRecipientIds,
          testFireAt: fireAt ? new Date(fireAt).toISOString() : null,
        }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({}));
        toast({ title: "Couldn’t run", description: d.error ?? "Saving settings failed.", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/woods-square/schedule/run-now", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast({ title: "Run failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
        return;
      }

      // Summarise the per-window outcomes into one line.
      const windows: { outcome?: { ok?: boolean; invitedCount?: number; skippedCount?: number; failedCount?: number } }[] =
        data.result?.windows ?? [];
      let sent = 0;
      let skipped = 0;
      let failed = 0;
      for (const w of windows) {
        const o = w.outcome;
        if (o?.ok) {
          sent += o.invitedCount ?? 0;
          skipped += o.skippedCount ?? 0;
          failed += o.failedCount ?? 0;
        } else {
          failed += 1;
        }
      }
      toast({
        title: "Run complete",
        description: `${sent} sent · ${skipped} skipped${failed ? ` · ${failed} failed` : ""} across ${windows.length} window(s).`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Run failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  async function checkConnection() {
    setConn("testing");
    try {
      const res = await fetch("/api/habitap/test-connection");
      const data = await res.json().catch(() => ({}));
      setConn(data.ok ? "ok" : "fail");
      toast(
        data.ok
          ? { title: "Connection OK", description: "Woods Square login works." }
          : { title: "Connection failed", description: data.error, variant: "destructive" },
      );
    } catch (err) {
      setConn("fail");
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* Full-screen run overlay — blocks interaction and shows live elapsed time + estimate */}
      {running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-950 p-6 text-center shadow-2xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-400" />
            <p className="mt-4 text-base font-semibold text-white">Sending Woods Square invites…</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-indigo-300">{formatElapsed(elapsed)}</p>
            <p className="mt-3 text-xs text-gray-400">
              Logging into Habitap, creating the events and emailing PINs across{" "}
              <b>
                {windowCount} weekly window{windowCount === 1 ? "" : "s"}
              </b>{" "}
              — roughly <b>30–60 seconds each</b>, so usually a couple of minutes in total.
            </p>
            <p className="mt-2 text-[11px] text-gray-500">Please keep this tab open until it finishes.</p>
          </div>
        </div>
      )}

      {/* ── Scheduler ── */}
      <Card className="bg-gray-950 border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <CalendarClock className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Automatic monthly invites</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Health banner — reflects the LIVE toggle state here in Settings (the same banner
              also shows on the Send-Invites landing tab, from the saved config). */}
          <WoodsSquareHealthBanner
            enabled={enabled}
            testMode={testMode}
            lastProdFiredAt={scheduleConfig.lastProdFiredAt}
          />

          {/* Master switch */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Enable automatic invites</p>
              <p className="mt-0.5 text-xs text-gray-500">
                On the last Monday of each month at 12:00 PM, send next month&rsquo;s building-access
                invites — split into 7-day windows.
              </p>
            </div>
            <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} label="Enable automatic invites" />
          </div>

          {/* Test mode */}
          <div className="flex items-start justify-between gap-4 border-t border-gray-800 pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Test mode</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Instead of the monthly run, fire a single test invite at a time you choose — to verify
                the trigger works.
              </p>
            </div>
            <Toggle on={testMode} onClick={() => setTestMode((v) => !v)} label="Test mode" />
          </div>

          {/* Next automatic run — ALWAYS visible (independent of Test mode) */}
          <div
            className={`rounded-xl border p-4 ${
              enabled && !testMode ? "border-indigo-500/40 bg-indigo-500/5" : "border-gray-800 bg-gray-900/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                <CalendarClock className="h-3.5 w-3.5" />
                Next automatic run
              </span>
              {testMode ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Test mode
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-700/40 text-gray-400"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-gray-500"}`} />
                  {enabled ? "Active" : "Paused"}
                </span>
              )}
            </div>

            <p className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  enabled && !testMode ? "text-white" : "text-gray-500"
                }`}
              >
                {format(run, "EEE, d MMM yyyy")}
              </span>
              <span className="text-sm text-gray-400">· 12:00 PM</span>
            </p>

            {testMode ? (
              <p className="mt-1 text-xs text-amber-400/80">
                Monthly run is paused while Test mode is on — the test below fires instead.
              </p>
            ) : enabled ? (
              <>
                <p className="mt-1 text-sm font-medium text-indigo-300">
                  {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Sends next month&rsquo;s invites to{" "}
                  <span className="text-gray-300">
                    {onListStaff.length} {onListStaff.length === 1 ? "person" : "people"}
                  </span>{" "}
                  on the list, split into 7-day windows.
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Turn on &ldquo;Enable automatic invites&rdquo; above to schedule the monthly run.
              </p>
            )}
          </div>

          {/* Test mode controls — shown below the card, only when Test mode is on */}
          {testMode && (
            <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              {/* Test recipients (multi-select — pick 2+ to exercise the bulk send) */}
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 pt-1.5 text-xs text-gray-500">Test recipients</span>
                <div className="flex-1">
                  <div className="max-h-44 divide-y divide-gray-800/70 overflow-y-auto rounded-md border border-gray-800 bg-gray-900">
                    {onListStaff.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-gray-500">No one on the Woods Square list yet.</p>
                    ) : (
                      onListStaff.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-gray-800/40"
                        >
                          <input
                            type="checkbox"
                            checked={testRecipientIds.includes(s.id)}
                            onChange={() => toggleTestRecipient(s.id)}
                            className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-indigo-500 focus:ring-indigo-400"
                          />
                          <span className="text-sm text-white">{s.name}</span>
                          <span className="truncate text-xs text-gray-500">{s.deliveryEmail || s.email}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {testRecipientIds.length} selected — pick <b>2 or more</b> to test the bulk send.
                  </p>
                </div>
              </div>
              {/* Fire date + time */}
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-gray-500">Fire at</span>
                <input
                  type="datetime-local"
                  value={fireAt}
                  min={nowInSingapore()}
                  onChange={(e) => onFireAtChange(e.target.value)}
                  className="flex-1 rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Runs the exact live logic — next month&rsquo;s invites, split into 7-day windows — but
                only to the selected test recipients. The app fires it <b>automatically</b> once the time
                passes (checked every minute — no Coolify or clicking needed). No dates to pick; duplicates
                are skipped.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-3">
            <Button
              variant="outline"
              onClick={runNow}
              disabled={running || saving || (testMode && testRecipientIds.length === 0)}
              title={testMode && testRecipientIds.length === 0 ? "Pick at least one test recipient first" : undefined}
            >
              {running ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1.5" />
              )}
              {running ? "Running…" : "Run now"}
            </Button>
            <span className="flex shrink-0 items-center gap-1.5 text-xs">
              {saving ? (
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Connection ── */}
      <Card className="bg-gray-950 border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <Plug className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Habitap connection</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                conn === "ok" ? "bg-emerald-400" : conn === "fail" ? "bg-red-400" : "bg-gray-600"
              }`}
            />
            <div>
              <p className="text-sm text-white">
                {conn === "ok" ? "Connected" : conn === "fail" ? "Connection failed" : conn === "testing" ? "Checking…" : "Not checked"}
              </p>
              <p className="text-xs text-gray-500">
                Verify the Woods Square (Habitap) login used to send invites.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={checkConnection} disabled={conn === "testing"}>
            {conn === "testing" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : conn === "fail" ? (
              <XCircle className="h-3.5 w-3.5 mr-1.5 text-red-400" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Check connection
          </Button>
        </div>
      </Card>

      {/* ── Invite list (roster + delivery email) ── */}
      <WoodsSquareManageList staff={manageStaff} />
    </div>
  );
}
