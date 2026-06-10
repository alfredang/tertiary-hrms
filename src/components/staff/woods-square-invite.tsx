"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Loader2,
  Search,
  ChevronDown,
  CheckCircle2,
  Users,
  Send,
  CalendarRange,
  Eye,
  AlertTriangle,
  XCircle,
  X,
  Inbox,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { InviteStatusPill } from "@/components/staff/invite-status-pill";
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

export function WoodsSquareInvite({ staff }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [tab, setTab] = useState<"send" | "requests" | "log">("send");
  const [logsOpen, setLogsOpen] = useState(true);
  const [logFilter, setLogFilter] = useState<"ALL" | "SENT" | "FAILED" | "SKIPPED">("ALL");
  const [showAllSelected, setShowAllSelected] = useState(false);
  const [requestsHistoryOpen, setRequestsHistoryOpen] = useState(false);
  const [conn, setConn] = useState<{ status: "idle" | "testing" | "ok" | "fail" }>({ status: "idle" });
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  // Confirm + in-flight state for the destructive Decline action so a single
  // misclick can't reject a request, and the popup shows progress / errors.
  const [declineConfirm, setDeclineConfirm] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

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

  useEffect(() => {
    loadLogs();
    loadRequests();
  }, [loadLogs, loadRequests]);

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

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const resolvedRequests = requests.filter((r) => r.status !== "PENDING");
  const requestToDecline = declineConfirm
    ? requests.find((r) => r.id === declineConfirm) ?? null
    : null;

  // Pending requests that already have a valid (≤7-day) window — eligible for bulk approve.
  const datedPending = pendingRequests.filter((r) => {
    if (!r.fromDate || !r.toDate) return false;
    const days = windowDaysInclusive(r.fromDate, r.toDate);
    return days >= 1 && days <= MAX_WINDOW_DAYS;
  });

  const sentLogCount = logs.filter((l) => l.status === "SENT").length;
  const failedLogCount = logs.filter((l) => l.status === "FAILED").length;
  const skippedLogCount = logs.filter((l) => l.status === "SKIPPED").length;
  const filteredLogs = logFilter === "ALL" ? logs : logs.filter((l) => l.status === logFilter);

  // Core send — used by the Send panel and by approving a request directly.
  // fromIso/toIso are yyyy-MM-dd.
  async function runSend(staffIds: string[], fromIso: string, toIso: string) {
    setSubmitting(true);
    setResult(null);
    setProgress(4);
    // No server-side progress events, so estimate: ~12s overhead + ~3s per staff.
    const estMs = 12000 + staffIds.length * 3000;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setProgress(Math.min(93, ((Date.now() - startedAt) / estMs) * 100));
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
        toast({ title: "Failed to send invites", description: data.error, variant: "destructive" });
        return;
      }
      setResult(data as RunResult);
      const invited = data.invitedCount ?? 0;
      const skipped = data.skippedCount ?? 0;
      const failed = data.failedCount ?? 0;
      const skippedNames: string[] = (data.skipped ?? []).map((s: { name: string }) => s.name);
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

      toast({
        title,
        description: descParts.join(" · ") || undefined,
        variant: invited === 0 && failed > 0 ? "destructive" : undefined,
      });
      setSelectedIds(new Set());
      loadLogs();
      loadRequests();
    } catch (err) {
      toast({
        title: "Request error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      clearInterval(tick);
      setProgress(100);
      setSubmitting(false);
      setTimeout(() => setProgress(0), 700);
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

  // "Create invite" on a request: if it already has valid dates, send straight away;
  // otherwise pre-fill the Send panel so the admin can choose the dates.
  async function approveRequest(r: AccessRequest) {
    if (!r.fromDate || !r.toDate) {
      prepareRequest(r);
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
    // Reflect it in the Send panel, then send immediately.
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
    setTab("send");
    for (const g of Array.from(groups.values())) {
      await runSend(g.ids, g.from, g.to);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800">
        {(
          [
            ["send", "Send invites", 0],
            ["requests", "Requests", pendingRequests.length],
            ["log", "Activity Log", 0],
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
          {datedPending.length > 0 && (
            <Button
              size="sm"
              onClick={approveAll}
              disabled={submitting}
              className="ml-auto"
              title="Send invites for all pending requests that already have dates"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Create all ({datedPending.length})
            </Button>
          )}
        </div>

        {pendingRequests.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No pending requests.</p>
        ) : (
          <div className="divide-y divide-gray-900">
            {pendingRequests.map((r) => (
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
                  </div>
                  <p className="text-xs text-gray-500 truncate">{reqSummary(r)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="success"
                    disabled={submitting}
                    onClick={() => approveRequest(r)}
                  >
                    Create invite
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
            ))}
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
                        r.status === "FULFILLED"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {r.status === "FULFILLED" ? "Fulfilled" : "Declined"}
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

          <div className="max-h-[26rem] overflow-y-auto">
            {filtered.map((s) => {
              const usable = hasUsableEmail(s.email);
              const isSelected = selectedIds.has(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => usable && toggle(s.id)}
                  className={`group flex items-center gap-3 px-4 py-2.5 border-b border-gray-900 last:border-0 transition-colors ${
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
            <h2 className="text-sm font-semibold text-white">Send invites</h2>
            <button
              onClick={testConnection}
              disabled={conn.status === "testing"}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-60"
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
              <Button onClick={handleGenerate} disabled={submitting || !canSend} className="w-full">
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {submitting
                  ? "Sending invites…"
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
                    Logging in to Woods Square and sending — this can take a moment.
                  </p>
                </div>
              )}
              {!submitting && !canSend && (
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
            Invite log
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
                    onClick={() => setLogFilter(key)}
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
                      {filteredLogs.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-900/40 transition-colors">
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                            {format(new Date(l.createdAt), "dd MMM yyyy, h:mm a")}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <p className="text-white">{l.name}</p>
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
            </div>
          ))}
      </Card>
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
    </div>
  );
}
