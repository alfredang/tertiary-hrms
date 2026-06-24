"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Users,
  Send,
  CalendarRange,
  Eye,
  AlertTriangle,
  XCircle,
  X,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { InviteStatusPill } from "@/components/staff/invite-status-pill";
import { type ManageStaff } from "@/components/staff/woods-square-manage-list";
import { WoodsSquareSettings } from "@/components/staff/woods-square-settings";
import { WoodsSquareHealthBanner } from "@/components/staff/woods-square-health-banner";
import type { ScheduleConfig } from "@/lib/woods-square-schedule";
import { WoodsSquareOverview } from "@/components/staff/woods-square-overview";
import { useToast } from "@/hooks/use-toast";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  DATE_PRESETS,
  FROM_TIME,
  MAX_WINDOW_DAYS,
  TO_TIME,
  presetRange,
  windowDaysInclusive,
} from "@/lib/woods-square";

export interface InviteStaff {
  id: string;
  name: string;
  email: string;
  employeeId: string;
}

interface Props {
  staff: InviteStaff[];
  /** All employees + current on-list flag — drives the Settings (Manage list) tab. */
  manageStaff?: ManageStaff[];
  /** Current scheduler config — drives the Settings scheduler card. */
  scheduleConfig?: ScheduleConfig;
  /** Which tab to open on first load — lets a notification deep-link to "requests". */
  initialTab?: "send" | "requests" | "log" | "overview" | "manage";
}

type RunResult = {
  eventId: string | null;
  invitedCount: number;
  failedCount: number;
  skippedCount?: number;
  skipped?: { name: string; email: string; existingFrom?: string; existingTo?: string }[];
  failed: { invitee: { name: string; email: string }; error: string }[];
};

type LogRow = {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  eventId: string | null;
  fromDate: string;
  toDate: string;
  status: string;
  error: string | null;
  createdAt: string;
  roles?: string[];
};

type AccessRequest = {
  id: string;
  fromDate: string | null;
  toDate: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  employee: { id: string; name: string; email: string; roles: string[] };
};

/**
 * When the request came in (date + time), with an escalating colour as it ages so
 * stale ones stand out. Tooltip shows the relative age.
 */
function requestedHint(createdAt: string): { text: string; title: string; cls: string } {
  const d = parseISO(createdAt);
  const days = differenceInCalendarDays(new Date(), d);
  const text = `Requested on ${format(d, "d MMM, h:mm a")}`;
  const title = days <= 0 ? "Requested today" : `Requested ${days} day${days === 1 ? "" : "s"} ago`;
  if (days >= 5) return { text, title, cls: "bg-red-500/15 text-red-300" };
  if (days >= 2) return { text, title, cls: "bg-amber-500/15 text-amber-300" };
  return { text, title, cls: "bg-gray-700/40 text-gray-300" };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  HR: "HR",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  STAFF: "Staff",
  INTERN: "Intern",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-500/15 text-purple-300",
  HR: "bg-blue-500/15 text-blue-300",
  MANAGER: "bg-indigo-500/15 text-indigo-300",
  ACCOUNTANT: "bg-sky-500/15 text-sky-300",
  STAFF: "bg-slate-500/20 text-slate-300",
  INTERN: "bg-amber-500/15 text-amber-300",
};

function RoleBadges({ roles }: { roles?: string[] }) {
  if (!roles || roles.length === 0) return null;
  return (
    <>
      {roles.map((r) => (
        <span
          key={r}
          className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
            ROLE_COLORS[r] ?? "bg-gray-800 text-gray-400"
          }`}
        >
          {ROLE_LABELS[r] ?? r}
        </span>
      ))}
    </>
  );
}

/**
 * Live "is a send running" chip. Amber + pulsing dot while a Woods Square send is in
 * flight (this tab, another admin, or the scheduler); a quiet idle dot otherwise.
 */
function SendStatusPill({ running }: { running: boolean }) {
  return (
    <span
      title={
        running
          ? "A Woods Square send is currently running — new sends are paused until it finishes."
          : "No send is running — you can send invites."
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        running
          ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
          : "bg-gray-800 text-gray-400 ring-1 ring-gray-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          running ? "bg-amber-400 animate-pulse" : "bg-gray-500"
        }`}
      />
      {running ? "Send in progress" : "Idle"}
    </span>
  );
}

/** Staff without a usable email can't receive a building-access invite. */
function hasUsableEmail(email: string): boolean {
  return !!email && !email.includes(".noemail@");
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Deterministic, calm avatar tints (no green — matches the app accent family).
const AVATAR_COLORS = [
  "bg-indigo-500/20 text-indigo-300",
  "bg-blue-500/20 text-blue-300",
  "bg-violet-500/20 text-violet-300",
  "bg-sky-500/20 text-sky-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-fuchsia-500/20 text-fuchsia-300",
  "bg-rose-500/20 text-rose-300",
  "bg-amber-500/20 text-amber-300",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  testMode: true,
  testRecipientIds: [],
  testFireAt: null,
  lastProdFiredAt: null,
  lastTestFiredAt: null,
  lastAttemptAt: null,
  failureNotifiedAt: null,
  missedNotifiedMonth: null,
};

export function WoodsSquareInvite({
  staff,
  manageStaff = [],
  scheduleConfig = DEFAULT_SCHEDULE,
  initialTab = "send",
}: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  // During an "Invite All" bulk send: which window we're on, out of how many.
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [tab, setTab] = useState<"send" | "requests" | "log" | "overview" | "manage">(initialTab);
  const [reqRefreshing, setReqRefreshing] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const [logFilter, setLogFilter] = useState<"ALL" | "SENT" | "FAILED" | "SKIPPED">("ALL");
  const [logPage, setLogPage] = useState(0); // 0-indexed; page 0 = latest (logs are newest-first)
  const [showAllSelected, setShowAllSelected] = useState(false);
  const [requestsHistoryOpen, setRequestsHistoryOpen] = useState(false);
  const [conn, setConn] = useState<{ status: "idle" | "testing" | "ok" | "fail" }>({ status: "idle" });
  // Is a Woods Square send in flight RIGHT NOW (this tab, another admin, or the cron)?
  // Polled from the shared lock so we can warn/disable before a click hits the 409.
  const [sendRunning, setSendRunning] = useState(false);
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  // Confirm + in-flight state for the destructive Decline action so a single
  // misclick can't reject a request, and the popup shows progress / errors.
  const [declineConfirm, setDeclineConfirm] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  // Confirm before the bulk send, which fires real Habitap invites/emails to everyone.
  const [confirmInviteAll, setConfirmInviteAll] = useState(false);
  // Confirm before inviting a single ready request — it emails a real PIN, can't be undone.
  const [inviteConfirm, setInviteConfirm] = useState<AccessRequest | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/habitap/generate-pin");
      if (!res.ok) return;
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/woods-square/access-requests");
      if (!res.ok) return;
      const data = await res.json();
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      /* ignore */
    }
  }, []);

  // Fail-open: any error (network/auth) → treat as idle, so a flaky poll can never
  // leave the Send / Invite All buttons wedged. The server lock is the real guard.
  const loadSendStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/woods-square/send-status");
      if (!res.ok) {
        setSendRunning(false);
        return;
      }
      const data = await res.json();
      setSendRunning(Boolean(data.running));
    } catch {
      setSendRunning(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadRequests();
    loadSendStatus();
  }, [loadLogs, loadRequests, loadSendStatus]);

  // Poll the send lock so the "in progress" indicator reflects sends started elsewhere
  // (another admin, another tab, or the unattended scheduler). 4s is responsive without
  // being chatty; the interval is cleared on unmount.
  useEffect(() => {
    const id = setInterval(loadSendStatus, 4000);
    return () => clearInterval(id);
  }, [loadSendStatus]);

  // Keep the queue current without a full reload: pull fresh requests/logs whenever the
  // admin returns to this window/tab (e.g. after clicking a "new request" notification
  // elsewhere, or switching back from another app).
  useEffect(() => {
    const refresh = () => {
      loadRequests();
      loadLogs();
      loadSendStatus();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadRequests, loadLogs, loadSendStatus]);

  // Manual refresh for the Requests tab (mirrors the Activity Log's Refresh).
  const refreshRequests = async () => {
    setReqRefreshing(true);
    try {
      await loadRequests();
    } finally {
      setReqRefreshing(false);
    }
  };

  const prepareRequest = (r: AccessRequest) => {
    setSelectedIds(new Set([r.employee.id]));
    if (r.fromDate) setStartDate(r.fromDate);
    if (r.toDate) setEndDate(r.toDate);
    setTab("send");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const declineRequest = async (id: string) => {
    setDeclining(true);
    try {
      const res = await fetch(`/api/woods-square/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DECLINED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Couldn’t decline request",
          description: data.error,
          variant: "destructive",
        });
        return; // leave the popup open so the admin can retry or cancel
      }
      loadRequests();
      setDeclineConfirm(null);
    } catch (err) {
      toast({
        title: "Couldn’t decline request",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDeclining(false);
    }
  };

  const reqSummary = (r: AccessRequest) =>
    (r.fromDate && r.toDate
      ? `${format(parseISO(r.fromDate), "dd MMM yyyy")} – ${format(parseISO(r.toDate), "dd MMM yyyy")}`
      : "No specific dates") + (r.note ? ` · “${r.note}”` : "");

  async function testConnection() {
    setConn({ status: "testing" });
    try {
      const res = await fetch("/api/habitap/test-connection");
      const data = await res.json();
      if (data.ok) {
        setConn({ status: "ok" });
        toast({ title: "Connection OK", description: "Woods Square login works." });
      } else {
        setConn({ status: "fail" });
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      setConn({ status: "fail" });
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [staff, search]);

  const eligible = filtered.filter((s) => hasUsableEmail(s.email));
  const allSelected = eligible.length > 0 && eligible.every((s) => selectedIds.has(s.id));
  const selected = staff.filter((s) => selectedIds.has(s.id));

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) eligible.forEach((s) => next.delete(s.id));
      else eligible.forEach((s) => next.add(s.id));
      return next;
    });

  const applyPreset = (fromOffset: number, toOffset: number) => {
    const { from, to } = presetRange(fromOffset, toOffset);
    setStartDate(from);
    setEndDate(to);
  };

  const windowDays = windowDaysInclusive(startDate, endDate);
  const overWindow = windowDays > MAX_WINDOW_DAYS;
  const canSend = selected.length > 0 && !!startDate && !!endDate && !overWindow;
  // Busy = our own send in flight OR a send running elsewhere (other tab/admin/cron).
  // Gates every send trigger so a click can't race into the 409 "already running".
  const busy = submitting || sendRunning;

  // A dated PENDING request whose end date has passed is treated as expired: it drops
  // out of the actionable queue and shows under "Past requests" labelled Expired.
  const isExpiredReq = (r: AccessRequest) =>
    r.status === "PENDING" && !!r.toDate && r.toDate < todayIso;
  const pendingRequests = requests.filter((r) => r.status === "PENDING" && !isExpiredReq(r));
  const resolvedRequests = requests.filter((r) => r.status !== "PENDING" || isExpiredReq(r));
  const requestToDecline = declineConfirm
    ? requests.find((r) => r.id === declineConfirm) ?? null
    : null;

  // Pending requests that already have a valid (≤7-day) window — eligible for bulk approve.
  const datedPending = pendingRequests.filter((r) => {
    if (!r.fromDate || !r.toDate) return false;
    const days = windowDaysInclusive(r.fromDate, r.toDate);
    return days >= 1 && days <= MAX_WINDOW_DAYS;
  });
  // Distinct windows = number of Habitap events the bulk send will create.
  const inviteAllEvents = new Set(datedPending.map((r) => `${r.fromDate}|${r.toDate}`)).size;

  const sentLogCount = logs.filter((l) => l.status === "SENT").length;
  const failedLogCount = logs.filter((l) => l.status === "FAILED").length;
  const skippedLogCount = logs.filter((l) => l.status === "SKIPPED").length;
  const filteredLogs = logFilter === "ALL" ? logs : logs.filter((l) => l.status === logFilter);
  // Paginate the log 20-per-page; page 0 is the latest since logs are newest-first.
  const LOG_PAGE_SIZE = 20;
  const logPageCount = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const currentLogPage = Math.min(logPage, logPageCount - 1); // clamp if data/filter shrank
  const pagedLogs = filteredLogs.slice(
    currentLogPage * LOG_PAGE_SIZE,
    currentLogPage * LOG_PAGE_SIZE + LOG_PAGE_SIZE,
  );

  // Builds the result-toast for a send (single or combined bulk total).
  function sendSummary(
    invited: number,
    skipped: number,
    failed: number,
    skippedNames: string[],
  ): { title: string; description?: string; variant?: "destructive" } {
    const nameList =
      skippedNames.slice(0, 4).join(", ") +
      (skippedNames.length > 4 ? ` +${skippedNames.length - 4} more` : "");
    let title: string;
    const descParts: string[] = [];
    if (invited > 0) {
      title = `${invited} invite${invited === 1 ? "" : "s"} sent`;
      if (skipped) descParts.push(`Already had access: ${nameList}`);
      if (failed) descParts.push(`${failed} failed`);
    } else if (failed > 0) {
      title = "Couldn’t send invites";
      descParts.push(`${failed} failed${skipped ? ` · already invited: ${nameList}` : ""}`);
    } else {
      title = "No new invites needed";
      descParts.push(`Already invited for these dates: ${nameList}`);
    }
    return {
      title,
      description: descParts.join(" · ") || undefined,
      variant: invited === 0 && failed > 0 ? "destructive" : undefined,
    };
  }

  // Core send — used by the Send panel, single approve, and (silently) by Invite All.
  // fromIso/toIso are yyyy-MM-dd. Returns the API result, or null on error.
  // For bulk sends, groupIndex/groupTotal make the progress bar span the whole run
  // (no per-window reset) and `silent` defers the toast/result to the caller.
  async function runSend(
    staffIds: string[],
    fromIso: string,
    toIso: string,
    opts: { silent?: boolean; groupIndex?: number; groupTotal?: number } = {},
  ): Promise<RunResult | null> {
    const { silent = false, groupIndex = 0, groupTotal = 1 } = opts;
    setSubmitting(true);
    if (!silent) setResult(null);
    // This group's slice of the overall 0–100 bar.
    const base = (groupIndex / groupTotal) * 100;
    const span = 100 / groupTotal;
    setProgress(Math.max(4, base + 1));
    // No server-side progress events, so estimate: ~12s overhead + ~3s per staff.
    const estMs = 12000 + staffIds.length * 3000;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const frac = Math.min(0.93, (Date.now() - startedAt) / estMs);
      setProgress(base + span * frac);
    }, 250);
    try {
      const res = await fetch("/api/habitap/generate-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffIds,
          window: {
            fromDate: format(new Date(`${fromIso}T00:00:00`), "dd MMM yyyy"),
            fromTime: FROM_TIME,
            toDate: format(new Date(`${toIso}T00:00:00`), "dd MMM yyyy"),
            toTime: TO_TIME,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent)
          toast({ title: "Failed to send invites", description: data.error, variant: "destructive" });
        return null;
      }
      if (!silent) {
        setResult(data as RunResult);
        const skippedNames: string[] = (data.skipped ?? []).map((s: { name: string }) => s.name);
        toast(sendSummary(data.invitedCount ?? 0, data.skippedCount ?? 0, data.failedCount ?? 0, skippedNames));
        setSelectedIds(new Set());
        loadLogs();
        loadRequests();
      }
      return data as RunResult;
    } catch (err) {
      if (!silent)
        toast({
          title: "Request error",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      return null;
    } finally {
      clearInterval(tick);
      if (silent) {
        setProgress(base + span); // mark this window complete; caller finishes up
      } else {
        setProgress(100);
        setSubmitting(false);
        setTimeout(() => setProgress(0), 700);
        loadSendStatus(); // lock just released — refresh the indicator promptly
      }
    }
  }

  async function handleGenerate() {
    if (selected.length === 0) {
      toast({ title: "Select at least one staff member", variant: "destructive" });
      return;
    }
    if (!startDate || !endDate) {
      toast({ title: "Pick a start and end date", variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: "End date must be on or after the start date", variant: "destructive" });
      return;
    }
    if (overWindow) {
      toast({ title: "Window too long", description: "Woods Square allows up to 7 days.", variant: "destructive" });
      return;
    }
    await runSend(selected.map((s) => s.id), startDate, endDate);
  }

  // "Invite" on a request: if it already has a valid window, ask to confirm (the send
  // emails a real PIN and can't be undone); otherwise pre-fill the Send panel so the
  // admin can choose/fix the dates first.
  async function approveRequest(r: AccessRequest) {
    if (!r.fromDate || !r.toDate) {
      prepareRequest(r);
      toast({
        title: "Pick an access window",
        description: "This request didn’t specify dates — choose them below, then send.",
      });
      return;
    }
    const days = windowDaysInclusive(r.fromDate, r.toDate);
    if (days < 1 || days > MAX_WINDOW_DAYS) {
      prepareRequest(r);
      toast({
        title: "Review the dates",
        description: `This request's window is outside the ${MAX_WINDOW_DAYS}-day limit — adjust and send.`,
        variant: "destructive",
      });
      return;
    }
    // Ready to send — confirm first (matches Decline and Invite All).
    setInviteConfirm(r);
  }

  // Confirmed single invite: reflect it in the Send panel, then send.
  async function sendApprovedRequest(r: AccessRequest) {
    if (!r.fromDate || !r.toDate) return;
    setInviteConfirm(null);
    setSelectedIds(new Set([r.employee.id]));
    setStartDate(r.fromDate);
    setEndDate(r.toDate);
    setTab("send");
    await runSend([r.employee.id], r.fromDate, r.toDate);
  }

  // Bulk: approve every pending request that already has a valid date window.
  // Requests are grouped by identical window so each window becomes one event.
  async function approveAll() {
    if (datedPending.length === 0) return;
    const groups = new Map<string, { from: string; to: string; ids: string[] }>();
    for (const r of datedPending) {
      const key = `${r.fromDate}|${r.toDate}`;
      const g = groups.get(key) ?? { from: r.fromDate as string, to: r.toDate as string, ids: [] };
      g.ids.push(r.employee.id);
      groups.set(key, g);
    }
    const groupList = Array.from(groups.values());
    setTab("send");
    setConfirmInviteAll(false);
    setSubmitting(true);
    setResult(null);

    // Run each window silently, accumulating one combined result + a single summary toast.
    const agg: RunResult = { eventId: null, invitedCount: 0, failedCount: 0, skippedCount: 0, skipped: [], failed: [] };
    for (let i = 0; i < groupList.length; i++) {
      const g = groupList[i];
      setBulkProgress({ current: i + 1, total: groupList.length });
      const data = await runSend(g.ids, g.from, g.to, {
        silent: true,
        groupIndex: i,
        groupTotal: groupList.length,
      });
      if (data) {
        agg.invitedCount += data.invitedCount ?? 0;
        agg.failedCount += data.failedCount ?? 0;
        agg.skippedCount = (agg.skippedCount ?? 0) + (data.skippedCount ?? 0);
        agg.skipped = (agg.skipped ?? []).concat(data.skipped ?? []);
        agg.failed = agg.failed.concat(data.failed ?? []);
      }
    }

    setResult(agg);
    toast(
      sendSummary(
        agg.invitedCount,
        agg.skippedCount ?? 0,
        agg.failedCount,
        (agg.skipped ?? []).map((s) => s.name),
      ),
    );
    setBulkProgress(null);
    setProgress(100);
    setSubmitting(false);
    setTimeout(() => setProgress(0), 700);
    setSelectedIds(new Set());
    loadLogs();
    loadRequests();
    loadSendStatus(); // lock just released — refresh the indicator promptly
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800">
        {(
          [
            ["send", "Send Invites", 0],
            ["requests", "Requests", pendingRequests.length],
            ["log", "Activity Log", 0],
            ["overview", "Overview", 0],
            ["manage", "Settings", 0],
          ] as const
        ).map(([id, label, badge]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? "text-white border-b-2 border-indigo-500"
                : "text-gray-400 hover:text-white border-b-2 border-transparent"
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-300 rounded-full px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "requests" && (
      <Card className="bg-gray-950 border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <Inbox className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Access requests</h2>
          {pendingRequests.length > 0 && (
            <span className="text-xs text-amber-300 bg-amber-950/40 rounded-full px-2 py-0.5">
              {pendingRequests.length} pending
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <SendStatusPill running={sendRunning} />
            <button
              onClick={refreshRequests}
              disabled={reqRefreshing}
              title="Check for new requests"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reqRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {datedPending.length > 0 && (
              <Button
                size="sm"
                onClick={() => setConfirmInviteAll(true)}
                disabled={busy}
                title={
                  sendRunning
                    ? "A send is already running — wait for it to finish"
                    : "Send invites for all pending requests that already have dates"
                }
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Invite All ({datedPending.length})
              </Button>
            )}
          </div>
        </div>

        {pendingRequests.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No pending requests.</p>
        ) : (
          <div className="divide-y divide-gray-900">
            {pendingRequests.map((r) => {
              const req = requestedHint(r.createdAt);
              return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(
                    r.employee.name,
                  )}`}
                >
                  {initials(r.employee.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white truncate">{r.employee.name}</p>
                    <RoleBadges roles={r.employee.roles} />
                    <span
                      title={req.title}
                      className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${req.cls}`}
                    >
                      {req.text}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{reqSummary(r)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="success"
                    disabled={busy}
                    onClick={() => approveRequest(r)}
                  >
                    Invite
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={submitting}
                    onClick={() => setDeclineConfirm(r.id)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {resolvedRequests.length > 0 && (
          <div className="border-t border-gray-800">
            <button
              onClick={() => setRequestsHistoryOpen((o) => !o)}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${requestsHistoryOpen ? "" : "-rotate-90"}`}
              />
              Past requests ({resolvedRequests.length})
            </button>
            {requestsHistoryOpen && (
              <div className="divide-y divide-gray-900 border-t border-gray-800">
                {resolvedRequests.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarColor(
                        r.employee.name,
                      )}`}
                    >
                      {initials(r.employee.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-white truncate">{r.employee.name}</p>
                        <RoleBadges roles={r.employee.roles} />
                      </div>
                      <p className="text-xs text-gray-500 truncate">{reqSummary(r)}</p>
                    </div>
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${
                        isExpiredReq(r)
                          ? "bg-gray-500/15 text-gray-400"
                          : r.status === "FULFILLED"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {isExpiredReq(r) ? "Expired" : r.status === "FULFILLED" ? "Fulfilled" : "Declined"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      )}

      {tab === "send" && (
      <div className="space-y-6">
        {/* Scheduler health — so an admin landing here sees at a glance whether the
            automatic monthly send is actually running (off / test-mode / stale). */}
        <WoodsSquareHealthBanner
          enabled={scheduleConfig.enabled}
          testMode={scheduleConfig.testMode}
          lastProdFiredAt={scheduleConfig.lastProdFiredAt}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Staff picker */}
        <Card className="lg:col-span-2 bg-gray-950 border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-white">Select staff</h2>
              <span className="text-xs text-gray-500">
                {selected.length > 0 ? `${selected.length} selected` : `${eligible.length} eligible`}
              </span>
            </div>
            <button
              onClick={toggleAll}
              disabled={eligible.length === 0}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search staff by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Keyboard hint — selecting staff works mouse-free; spell out the keys. */}
          {eligible.length > 0 && (
            <div className="flex items-center justify-end gap-1.5 px-4 py-1.5 border-b border-gray-800 text-[11px] text-gray-500">
              <kbd className="rounded border border-gray-700 bg-gray-900 px-1 py-px font-sans text-[10px] text-gray-400">
                Tab
              </kbd>
              <span>to move</span>
              <span className="text-gray-700">·</span>
              <kbd className="rounded border border-gray-700 bg-gray-900 px-1 py-px font-sans text-[10px] text-gray-400">
                Space
              </kbd>
              <span>to select</span>
            </div>
          )}

          <div className="max-h-[26rem] overflow-y-auto">
            {filtered.map((s) => {
              const usable = hasUsableEmail(s.email);
              const isSelected = selectedIds.has(s.id);
              return (
                <div
                  key={s.id}
                  // Keyboard-operable checkbox row: focusable when selectable, toggled
                  // with Space/Enter, and announced to screen readers via role/aria-checked.
                  role="checkbox"
                  aria-checked={usable ? isSelected : undefined}
                  aria-disabled={!usable}
                  aria-label={usable ? s.name : `${s.name} — no email on file, can't be invited`}
                  tabIndex={usable ? 0 : -1}
                  onClick={() => usable && toggle(s.id)}
                  onKeyDown={(e) => {
                    if (usable && (e.key === " " || e.key === "Enter")) {
                      e.preventDefault();
                      toggle(s.id);
                    }
                  }}
                  className={`group flex items-center gap-3 px-4 py-2.5 border-b border-gray-900 transition-colors last:border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 ${
                    !usable
                      ? ""
                      : isSelected
                        ? "bg-indigo-950/20 cursor-pointer"
                        : "hover:bg-gray-900 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!usable}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className={`pointer-events-none accent-indigo-500 ${!usable ? "opacity-40" : ""}`}
                  />
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(
                      s.name,
                    )} ${isSelected ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950" : ""}`}
                  >
                    {initials(s.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${usable ? "text-white" : "text-gray-300"}`}>
                      {s.name}
                    </p>
                    {usable ? (
                      <p className="text-xs text-gray-500 truncate">{s.email}</p>
                    ) : (
                      <p className="text-xs text-amber-500/90 truncate">No email on file</p>
                    )}
                  </div>
                  {usable && (
                    <Link
                      href={`/woods-square/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-400 whitespace-nowrap shrink-0 px-2 py-1 rounded-md hover:bg-gray-800 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View invites
                    </Link>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-10">No staff found</p>
            )}
          </div>
        </Card>

        {/* Action panel */}
        <Card className="bg-gray-950 border-gray-800 overflow-hidden lg:sticky lg:top-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
            <Send className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Send Invites</h2>
            <span className="ml-auto">
              <SendStatusPill running={sendRunning} />
            </span>
            <button
              onClick={testConnection}
              disabled={conn.status === "testing"}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-60"
            >
              {conn.status === "testing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : conn.status === "ok" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : conn.status === "fail" ? (
                <XCircle className="h-3.5 w-3.5 text-red-400" />
              ) : null}
              {conn.status === "testing" ? "Checking…" : "Check connection"}
            </button>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-400">
              Creates a Woods Square &ldquo;Staff Invite&rdquo; event for the chosen dates. Each selected
              staff member is emailed their own building-access PIN, valid for that window.
            </p>

            {/* Selected staff tray */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Selected
                  <span className="ml-1.5 text-indigo-400 tabular-nums">{selected.length}</span>
                </span>
                <div className="flex items-center gap-3">
                  {selected.length > 8 && (
                    <button
                      onClick={() => setShowAllSelected((o) => !o)}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {showAllSelected ? "Show less" : "Show all"}
                    </button>
                  )}
                  {selected.length > 0 && (
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {selected.length === 0 ? (
                <p className="text-xs text-gray-600 bg-gray-900/50 rounded-lg px-3 py-2.5">
                  No staff selected yet — pick people from the list.
                </p>
              ) : showAllSelected ? (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-900">
                  {selected.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5">
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarColor(
                          s.name,
                        )}`}
                      >
                        {initials(s.name)}
                      </div>
                      <span className="text-sm text-gray-200 truncate flex-1">{s.name}</span>
                      <button
                        onClick={() => toggle(s.id)}
                        title={`Remove ${s.name}`}
                        className="text-gray-500 hover:text-white rounded p-0.5 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {selected.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        title={`Remove ${s.name}`}
                        className={`group/av relative h-8 w-8 rounded-full ring-2 ring-gray-950 flex items-center justify-center text-xs font-semibold transition hover:z-10 hover:ring-gray-700 ${avatarColor(
                          s.name,
                        )}`}
                      >
                        <span className="group-hover/av:opacity-0 transition-opacity">
                          {initials(s.name)}
                        </span>
                        <X className="absolute h-3.5 w-3.5 opacity-0 group-hover/av:opacity-100 text-white transition-opacity" />
                      </button>
                    ))}
                    {selected.length > 8 && (
                      <button
                        onClick={() => setShowAllSelected(true)}
                        title="Show all selected"
                        className="h-8 w-8 rounded-full ring-2 ring-gray-950 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white text-xs font-semibold flex items-center justify-center transition-colors"
                      >
                        +{selected.length - 8}
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {selected.length > 8 ? "Tap +more to see all" : "Tap an avatar to remove"}
                  </span>
                </div>
              )}
            </div>

            {/* Access window */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                <CalendarRange className="h-3.5 w-3.5" />
                Access window
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
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

            {/* Send */}
            <div className="space-y-1.5">
              <Button onClick={handleGenerate} disabled={busy || !canSend} className="w-full">
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {submitting
                  ? "Sending invites…"
                  : sendRunning
                    ? "Another send is running…"
                    : `Send ${selected.length || ""} invite${selected.length === 1 ? "" : "s"}`.trim()}
              </Button>
              {submitting && (
                <div className="space-y-1 pt-0.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500">
                    {bulkProgress
                      ? `Sending window ${bulkProgress.current} of ${bulkProgress.total} — this can take a moment.`
                      : "Logging in to Woods Square and sending — this can take a moment."}
                  </p>
                </div>
              )}
              {sendRunning && !submitting && (
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-amber-300/90">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  A send is already running — this will unlock when it finishes.
                </p>
              )}
              {!busy && !canSend && (
                <p className="text-xs text-center text-gray-500">
                  {selected.length === 0
                    ? "Select at least one staff member"
                    : !startDate || !endDate
                      ? "Pick a start and end date"
                      : overWindow
                        ? "Shorten the window to 7 days or fewer"
                        : ""}
                </p>
              )}
            </div>

            {result && (
              <div
                className={`relative rounded-lg p-3 pr-8 text-sm space-y-2 border ${
                  result.invitedCount > 0
                    ? "bg-emerald-950/20 border-emerald-800/40"
                    : "bg-amber-950/20 border-amber-800/40"
                }`}
              >
                <button
                  onClick={() => setResult(null)}
                  aria-label="Dismiss"
                  className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                {result.invitedCount > 0 ? (
                  <p className="text-emerald-400 font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Invites sent to {result.invitedCount} staff member
                    {result.invitedCount === 1 ? "" : "s"}.
                  </p>
                ) : (
                  <p className="text-amber-300 font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    No new invites were sent.
                  </p>
                )}
                {result.skipped && result.skipped.length > 0 && (
                  <div className="text-xs text-amber-300/90 space-y-1 pt-1 border-t border-amber-800/30">
                    {result.skipped.map((s, i) => (
                      <p key={i} className="flex gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                        <span>
                          {s.name} already has an invite
                          {s.existingFrom ? ` (${s.existingFrom} – ${s.existingTo})` : ""} covering these
                          dates.
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                {result.failed.length > 0 && (
                  <ul className="text-xs text-red-300 space-y-1 pt-1 border-t border-red-800/30">
                    {result.failed.map((f, i) => (
                      <li key={i} className="flex gap-1.5">
                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                        <span>
                          Couldn&rsquo;t invite {f.invitee.name} ({f.invitee.email}): {f.error}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Card>
        </div>
      </div>
      )}

      {tab === "log" && (
      <Card className="bg-gray-950 border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setLogsOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-white hover:text-gray-300 transition-colors"
          >
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${logsOpen ? "" : "-rotate-90"}`}
            />
            Invite Log
            <span className="text-xs font-normal text-gray-500">({logs.length})</span>
          </button>
          {logsOpen && (
            <button
              onClick={loadLogs}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Refresh
            </button>
          )}
        </div>

        {logsOpen &&
          (logs.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center border-t border-gray-800">
              No invites sent yet.
            </p>
          ) : (
            <div className="border-t border-gray-800">
              {/* Status filter */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-gray-800">
                {(
                  [
                    ["ALL", "All", logs.length],
                    ["SENT", "Sent", sentLogCount],
                    ["FAILED", "Failed", failedLogCount],
                    ["SKIPPED", "Skipped", skippedLogCount],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setLogFilter(key);
                      setLogPage(0);
                    }}
                    className={`text-xs rounded-full px-2.5 py-1 transition-colors ${
                      logFilter === key
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {label} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                ))}
              </div>

              {filteredLogs.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  No {logFilter === "FAILED" ? "failed" : logFilter === "SKIPPED" ? "skipped" : "sent"}{" "}
                  invites.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400 bg-gray-900/40 border-b border-gray-800">
                        <th className="px-4 py-2 font-medium whitespace-nowrap">Sent</th>
                        <th className="px-4 py-2 font-medium whitespace-nowrap">Staff</th>
                        <th className="px-4 py-2 font-medium whitespace-nowrap">Access window</th>
                        <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-900">
                      {pagedLogs.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-900/40 transition-colors">
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                            {format(new Date(l.createdAt), "dd MMM yyyy, h:mm a")}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {l.employeeId ? (
                              <Link
                                href={`/woods-square/${l.employeeId}`}
                                className="font-medium text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                              >
                                {l.name}
                              </Link>
                            ) : (
                              <p className="text-white">{l.name}</p>
                            )}
                            <p className="text-xs text-gray-500">{l.email}</p>
                            {l.roles && l.roles.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                <RoleBadges roles={l.roles} />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                            {l.fromDate} – {l.toDate}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <InviteStatusPill status={l.status} title={l.error ?? undefined} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredLogs.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-gray-800 px-4 py-2.5">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {currentLogPage * LOG_PAGE_SIZE + 1}–
                    {currentLogPage * LOG_PAGE_SIZE + pagedLogs.length}{" "}
                    <span className="text-gray-600">of</span> {filteredLogs.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                      disabled={currentLogPage === 0}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-900/60 disabled:hover:text-gray-300"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </button>
                    <span className="px-1.5 text-xs text-gray-500 tabular-nums">
                      Page <span className="font-medium text-gray-300">{currentLogPage + 1}</span> of{" "}
                      {logPageCount}
                    </span>
                    <button
                      onClick={() => setLogPage((p) => Math.min(logPageCount - 1, p + 1))}
                      disabled={currentLogPage >= logPageCount - 1}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-900/60 disabled:hover:text-gray-300"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {logs.length >= 100 && (
                <p className="border-t border-gray-800 px-4 py-2.5 text-center text-xs text-gray-500">
                  Showing the latest 100 invites — older entries aren&rsquo;t listed.
                </p>
              )}
            </div>
          ))}
      </Card>
      )}

      {tab === "overview" && <WoodsSquareOverview staff={staff} logs={logs} />}

      {tab === "manage" && (
        <WoodsSquareSettings manageStaff={manageStaff} scheduleConfig={scheduleConfig} />
      )}

      <DialogPrimitive.Root
        open={declineConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !declining) setDeclineConfirm(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-800 bg-gray-950 p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Decline access request
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-gray-400">
              Decline{" "}
              <span className="font-medium text-gray-200">
                {requestToDecline?.employee.name ?? "this staff member"}
              </span>
              ’s request? They’ll be notified and can request access again.
            </DialogPrimitive.Description>
            {requestToDecline ? (
              <p className="mt-2 text-xs text-gray-500">{reqSummary(requestToDecline)}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={submitting || declining}
                onClick={() => setDeclineConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={submitting || declining}
                onClick={() => declineConfirm && declineRequest(declineConfirm)}
              >
                {declining ? "Declining…" : "Decline"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Confirm single invite — fires a real Habitap invite/PIN email to one person. */}
      <DialogPrimitive.Root
        open={inviteConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !submitting) setInviteConfirm(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-800 bg-gray-950 p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <Send className="h-4 w-4 text-indigo-400" />
              Send building-access invite
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-gray-400">
              Invite{" "}
              <span className="font-medium text-gray-200">
                {inviteConfirm?.employee.name ?? "this staff member"}
              </span>
              ? They&rsquo;ll be emailed their entry PIN for the dates below. This can&rsquo;t be
              undone.
            </DialogPrimitive.Description>
            {inviteConfirm ? (
              <p className="mt-2 text-xs text-gray-500">{reqSummary(inviteConfirm)}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => setInviteConfirm(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => inviteConfirm && sendApprovedRequest(inviteConfirm)}
              >
                {submitting ? "Sending…" : sendRunning ? "Send running…" : "Send invite"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Confirm bulk send — fires real Habitap invites/emails to everyone at once. */}
      <DialogPrimitive.Root
        open={confirmInviteAll}
        onOpenChange={(open) => {
          if (!open && !submitting) setConfirmInviteAll(false);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 text-white shadow-2xl shadow-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                <Send className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-semibold leading-tight">
                  Invite all pending requests
                </DialogPrimitive.Title>
                <p className="mt-0.5 text-xs text-gray-400">
                  {datedPending.length} request{datedPending.length === 1 ? "" : "s"} ·{" "}
                  {inviteAllEvents} event{inviteAllEvents === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {/* Recipients */}
            <div className="px-5 pt-4">
              <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                Recipients
              </p>
              <div className="max-h-60 divide-y divide-gray-800/70 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900/40">
                {datedPending.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-900/70"
                    title={r.note ? `“${r.note}”` : undefined}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarColor(
                        r.employee.name,
                      )}`}
                    >
                      {initials(r.employee.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{r.employee.name}</p>
                      {r.note ? (
                        <p className="truncate text-xs text-gray-500">“{r.note}”</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-gray-400">
                      {format(parseISO(r.fromDate as string), "d MMM")} –{" "}
                      {format(parseISO(r.toDate as string), "d MMM yyyy")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <DialogPrimitive.Description className="text-xs text-amber-200/90">
                Each person receives their entry PIN by email. This can&rsquo;t be undone.
              </DialogPrimitive.Description>
            </div>

            {/* Footer */}
            <div className="mt-5 flex justify-end gap-2 border-t border-gray-800 bg-gray-950/60 px-5 py-4">
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => setConfirmInviteAll(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => approveAll()}>
                {submitting ? "Sending…" : sendRunning ? "Send running…" : `Invite all (${datedPending.length})`}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
