"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  KeyRound,
  Mail,
  Clock,
  CalendarRange,
  Info,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  type LucideIcon,
} from "lucide-react";
import { parse, parseISO, format, differenceInCalendarDays, isValid, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { RequestAccessButton } from "@/components/profile/request-access-button";

interface InviteRow {
  id: string;
  fromDate: string;
  toDate: string;
  createdAt: Date;
  status: string;
}

interface RequestRow {
  id: string;
  fromDate: string | null;
  toDate: string | null;
  note: string | null;
  status: string;
  createdAt: Date;
}

type AccessState = "ACTIVE" | "UPCOMING" | "EXPIRED";

/** Status wording + accents for the light Woods Square pass, mirroring the real app. */
const STATUS_LIGHT: Record<
  AccessState | "LOCKED",
  { word: string; cls: string; dot: string; bar: string; fill: string; avatar: string }
> = {
  ACTIVE: {
    word: "Activated",
    cls: "text-teal-700",
    dot: "bg-teal-500 ring-4 ring-teal-500/15",
    bar: "bg-gradient-to-r from-teal-400 to-emerald-500",
    fill: "bg-gradient-to-r from-teal-400 to-emerald-500",
    avatar: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  UPCOMING: {
    word: "Scheduled",
    cls: "text-amber-900",
    dot: "bg-amber-900 ring-4 ring-amber-900/15",
    bar: "bg-gradient-to-r from-amber-800 to-amber-900",
    fill: "bg-gradient-to-r from-amber-800 to-amber-900",
    avatar: "bg-amber-100 text-amber-900 ring-amber-300",
  },
  EXPIRED: {
    word: "Expired",
    cls: "text-gray-400",
    dot: "bg-gray-300",
    bar: "bg-gray-200",
    fill: "bg-gray-300",
    avatar: "bg-gray-100 text-gray-400 ring-gray-200",
  },
  LOCKED: {
    word: "Not activated",
    cls: "text-gray-400",
    dot: "bg-gray-300",
    bar: "bg-gray-200",
    fill: "bg-gray-300",
    avatar: "bg-gray-100 text-gray-400 ring-gray-200",
  },
};

/** Up-to-two-letter initials for the holder avatar. */
function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Secondary pass rows (dark theme). The key-icon tile is always violet; only the
 * status pill/dot is color-coded by state (green active, yellow upcoming, red expired).
 */
const ROW_TILE = "bg-gray-800 text-white ring-1 ring-gray-700";

const ROW_STYLE: Record<AccessState, { label: string; pill: string; dot: string }> = {
  ACTIVE: {
    label: "Active now",
    pill: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  UPCOMING: {
    label: "Upcoming",
    pill: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
    dot: "bg-amber-400",
  },
  EXPIRED: {
    label: "Expired",
    pill: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
    dot: "bg-red-400",
  },
};

const REQUEST_STATUS: Record<string, { label: string; cls: string; Icon: LucideIcon }> = {
  PENDING: { label: "Pending", cls: "bg-amber-500/15 text-amber-400", Icon: Clock },
  FULFILLED: { label: "Fulfilled", cls: "bg-emerald-500/15 text-emerald-400", Icon: CheckCircle2 },
  DECLINED: { label: "Declined", cls: "bg-red-500/15 text-red-400", Icon: XCircle },
  EXPIRED: { label: "Expired", cls: "bg-gray-500/15 text-gray-400", Icon: Clock },
};

function parseHabitap(d: string): Date {
  return startOfDay(parse(d, "dd MMM yyyy", new Date()));
}

/** True only if both ends of an invite parse to real "dd MMM yyyy" dates. */
function hasValidWindow(inv: InviteRow): boolean {
  return isValid(parseHabitap(inv.fromDate)) && isValid(parseHabitap(inv.toDate));
}

// All date math takes an explicit `today` (start-of-day) so the server (UTC) and
// client (SGT) renders use the SAME reference — otherwise day counts can disagree
// and React throws a hydration mismatch + flicker. `today` is computed once on the
// server (Asia/Singapore) and passed down via the card's `nowIso` prop.
function accessState(fromStr: string, toStr: string, today: Date): AccessState {
  const from = parseHabitap(fromStr);
  const to = parseHabitap(toStr);
  if (today < from) return "UPCOMING";
  if (today > to) return "EXPIRED";
  return "ACTIVE";
}

function countdown(inv: InviteRow, state: AccessState, today: Date): string {
  const from = parseHabitap(inv.fromDate);
  const to = parseHabitap(inv.toDate);
  const totalDays = differenceInCalendarDays(to, from) + 1;
  if (state === "UPCOMING") {
    const d = differenceInCalendarDays(from, today);
    return d === 0 ? "Starts today" : `Starts in ${d} day${d === 1 ? "" : "s"}`;
  }
  if (state === "EXPIRED") {
    return `${totalDays} day${totalDays === 1 ? "" : "s"} · ended ${inv.toDate}`;
  }
  const left = differenceInCalendarDays(to, today);
  return left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`;
}

/** 0–100 elapsed progress through an active pass window. */
function activeProgress(inv: InviteRow, today: Date): number {
  const from = parseHabitap(inv.fromDate);
  const to = parseHabitap(inv.toDate);
  const total = differenceInCalendarDays(to, from) + 1;
  const elapsed = differenceInCalendarDays(today, from) + 1;
  return Math.max(6, Math.min(100, Math.round((elapsed / total) * 100)));
}

function fmtIso(iso: string): string {
  try {
    return format(parseISO(iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

function shortDate(d: Date): string {
  // Pin to Singapore time so the formatted date matches on server (UTC) and client (SGT).
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
}

/** Most relevant pass for the hero: active > soonest upcoming > most recent expired. */
function primaryPass(
  invites: InviteRow[],
  today: Date,
): { inv: InviteRow; state: AccessState } | null {
  const withState = invites.map((inv) => ({ inv, state: accessState(inv.fromDate, inv.toDate, today) }));
  return (
    withState.find((p) => p.state === "ACTIVE") ??
    withState
      .filter((p) => p.state === "UPCOMING")
      .sort((a, b) => +parseHabitap(a.inv.fromDate) - +parseHabitap(b.inv.fromDate))[0] ??
    withState[0] ??
    null
  );
}

export function WoodsSquareAccessCard({
  holderName,
  employeeId,
  nowIso,
  invites,
  requests,
  onRoster = true,
}: {
  holderName?: string;
  employeeId?: string | null;
  /** Server-computed "today" (yyyy-MM-dd, Asia/Singapore) — keeps SSR & client date math in sync. */
  nowIso?: string;
  invites: InviteRow[];
  requests: RequestRow[];
  /** Whether this person is on the Woods Square invite roster (can request a pass). */
  onRoster?: boolean;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // Single date reference shared by SSR + client (falls back to local now in previews).
  const today = startOfDay(nowIso ? parseISO(nowIso) : new Date());
  // Drop any row whose dates don't parse, so malformed data can't leak NaN into the
  // hero card's day counts / progress bar.
  const validInvites = invites.filter(hasValidWindow);
  const primary = primaryPass(validInvites, today);
  const otherPasses = primary ? validInvites.filter((i) => i.id !== primary.inv.id) : [];
  const [activeTab, setActiveTab] = useState<"passes" | "requests">(
    otherPasses.length > 0 ? "passes" : "requests",
  );

  const statusKey: AccessState | "LOCKED" = primary ? primary.state : "LOCKED";
  const status = STATUS_LIGHT[statusKey];

  async function cancelRequest(id: string) {
    setCancelling(id);
    try {
      await fetch(`/api/woods-square/access-requests/${id}`, { method: "DELETE" });
      setConfirmCancelId(null);
      router.refresh();
    } finally {
      setCancelling(null);
    }
  }

  const requestToCancel = confirmCancelId
    ? requests.find((r) => r.id === confirmCancelId) ?? null
    : null;

  return (
    <div className="space-y-5">
      {/* ───────── Section toolbar ───────── */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Mobile credential
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Your Woods Square building pass and entry PIN, in one place.
          </p>
        </div>
        {onRoster ? (
          <RequestAccessButton
            pendingCount={
              // Match the server cap: expired (past-dated) pending requests don't count.
              requests.filter(
                (r) => r.status === "PENDING" && !(r.toDate && parseISO(r.toDate) < today),
              ).length
            }
          />
        ) : (
          <span className="shrink-0 text-right text-xs text-gray-500">
            Not set up for Woods Square access.
            <br />
            Contact an admin.
          </span>
        )}
      </div>

      {/* ───────── Stacked: pass card, then details below ───────── */}
      <div className="space-y-5">
        {/* ── The Woods Square access card (light, like the real app) — centered rectangle ── */}
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[22px] border border-gray-200/80 bg-gradient-to-b from-white to-gray-50 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)] ring-1 ring-black/5">
          {/* status accent bar */}
          <div className={`h-1.5 w-full ${status.bar}`} />

          {/* whisper-faint guilloché rings, like a secure pass */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "repeating-radial-gradient(circle at 100% 0%, rgba(2,6,23,0.02) 0px, rgba(2,6,23,0.02) 1px, transparent 1px, transparent 16px)",
            }}
          />
          {/* large faint building watermark */}
          <Building2 className="pointer-events-none absolute -bottom-6 -right-4 h-40 w-40 text-gray-900/[0.03]" strokeWidth={1} />

        <div className="relative p-6">
          {/* header: brand badge + wordmark, info icon */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <div className="font-extralight lowercase tracking-tight text-[1.35rem] text-gray-500">
                  woods square
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                  Mobile Access
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="Mobile access card info"
              className="mt-0.5 shrink-0 rounded-full text-gray-300 transition-colors hover:text-gray-500"
            >
              <Info className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>

          {/* holder */}
          <div className="mt-7 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ${status.avatar}`}
            >
              {primary ? initials(holderName) : <KeyRound className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-gray-800">{holderName ?? "Staff"}</p>
              <p className="truncate text-xs text-gray-400">
                Staff{employeeId ? ` · ID ${employeeId}` : ""}
              </p>
            </div>
          </div>

          {/* status */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
              <span className={`text-xl font-bold ${status.cls}`}>{status.word}</span>
            </div>
            {primary && (
              <span className="shrink-0 text-xs font-medium text-gray-500">
                {countdown(primary.inv, primary.state, today)}
              </span>
            )}
          </div>

          {/* validity + progress, or request prompt when no pass */}
          {primary ? (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                  Valid
                </span>
                <span className="font-mono text-sm font-medium tabular-nums text-gray-600">
                  {primary.inv.fromDate} — {primary.inv.toDate}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${status.fill}`}
                  style={{
                    width:
                      primary.state === "ACTIVE"
                        ? `${activeProgress(primary.inv, today)}%`
                        : primary.state === "UPCOMING"
                          ? "4%"
                          : "100%",
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-500">
                No active pass. Tap{" "}
                <span className="font-medium text-gray-700">Request access</span> above — your entry
                PIN is emailed to you once it&rsquo;s granted.
              </p>
            </div>
          )}

          {/* in-card entry-method caption */}
          {primary && (
            <div className="relative mt-4 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="text-xs text-gray-500">Entry via PIN — sent to your email</span>
            </div>
          )}
        </div>
        </div>

        {/* ── Details column ── */}
        <div className="space-y-5">
          {/* PIN reminder */}
          {primary && (
            <div className="flex items-start gap-2.5 rounded-xl border border-indigo-900/40 bg-indigo-950/20 px-3.5 py-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
              <p className="text-xs text-gray-300">
                Your entry <span className="font-medium text-white">PIN is emailed to you</span> for
                each pass — check your inbox and spam.{" "}
                {employeeId ? <span className="text-gray-500">Staff ID {employeeId}.</span> : null}{" "}
                Lost it? Ask an admin to resend.
              </p>
            </div>
          )}

      {/* ───────── Tabs: Other passes / My requests ───────── */}
      {(otherPasses.length > 0 || requests.length > 0) && (
        <div>
          {/* tab bar */}
          <div className="flex items-center gap-6 border-b border-gray-800">
            {(
              [
                ["passes", "Other passes", otherPasses.length],
                ["requests", "My requests", requests.length],
              ] as const
            ).map(([key, label, count]) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`relative -mb-px px-1 pb-2.5 text-sm font-medium transition-colors ${
                    active ? "text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 text-xs text-gray-500">{count}</span>
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* panel */}
          <div className="mt-3 space-y-2.5">
            {activeTab === "passes" ? (
              otherPasses.length > 0 ? (
                otherPasses.map((inv) => {
                  const state = accessState(inv.fromDate, inv.toDate, today);
                  const s = ROW_STYLE[state];
                  const days =
                    differenceInCalendarDays(parseHabitap(inv.toDate), parseHabitap(inv.fromDate)) + 1;
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3.5 rounded-xl border border-gray-800 bg-gray-900/40 px-3.5 py-3 transition-colors hover:bg-gray-900/70"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ROW_TILE}`}>
                        <KeyRound className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {inv.fromDate} – {inv.toDate}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {days} day{days === 1 ? "" : "s"} · {countdown(inv, state, today)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.pill}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="py-6 text-center text-sm text-gray-500">No other passes.</p>
              )
            ) : requests.length > 0 ? (
              requests.map((r) => {
                // A pending request whose end date has passed reads as Expired, not Pending.
                const expired = r.status === "PENDING" && !!r.toDate && parseISO(r.toDate) < today;
                const badge = expired
                  ? REQUEST_STATUS.EXPIRED
                  : REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
                const StatusIcon = badge.Icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 px-3.5 py-2.5"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${badge.cls}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">
                        {r.fromDate && r.toDate
                          ? `${fmtIso(r.fromDate)} – ${fmtIso(r.toDate)}`
                          : "No specific dates"}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        Requested {shortDate(r.createdAt)}
                        {r.note ? ` · “${r.note}”` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {r.status === "PENDING" && !expired && (
                      <button
                        onClick={() => setConfirmCancelId(r.id)}
                        disabled={cancelling === r.id}
                        className="shrink-0 text-xs text-gray-400 transition-colors hover:text-red-400 disabled:opacity-50"
                      >
                        {cancelling === r.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-gray-500">No requests yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ───────── Empty state (no passes at all, no requests) ───────── */}
      {validInvites.length === 0 && requests.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 px-4 py-3.5">
          <CalendarRange className="h-4 w-4 shrink-0 text-gray-500" />
          <p className="text-sm text-gray-500">
            No passes or requests yet. Use{" "}
            <span className="font-medium text-gray-300">Request access</span> above to get started.
          </p>
        </div>
      )}
        </div>
      </div>

      {/* ───────── Cancel-request confirmation ───────── */}
      <DialogPrimitive.Root
        open={confirmCancelId !== null}
        onOpenChange={(open) => {
          if (!open && cancelling === null) setConfirmCancelId(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-800 bg-gray-950 p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Cancel access request
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-gray-400">
              Cancel this request? This can&rsquo;t be undone — you&rsquo;ll need to submit a new one.
            </DialogPrimitive.Description>
            {requestToCancel ? (
              <p className="mt-2 text-xs text-gray-500">
                {requestToCancel.fromDate && requestToCancel.toDate
                  ? `${fmtIso(requestToCancel.fromDate)} – ${fmtIso(requestToCancel.toDate)}`
                  : "No specific dates"}
                {requestToCancel.note ? ` · “${requestToCancel.note}”` : ""}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={cancelling !== null}
                onClick={() => setConfirmCancelId(null)}
              >
                Keep request
              </Button>
              <Button
                variant="destructive"
                disabled={cancelling !== null}
                onClick={() => confirmCancelId && cancelRequest(confirmCancelId)}
              >
                {cancelling ? "Cancelling…" : "Cancel request"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* ───────── Mobile Access Card Info (styled like the Habitap app) ───────── */}
      <DialogPrimitive.Root open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 flex max-h-[90vh] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] flex-col overflow-y-auto rounded-2xl border border-gray-800 bg-black p-6 text-white shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            {/* header */}
            <div className="relative mb-6 flex items-center justify-center">
              <DialogPrimitive.Title className="text-lg font-medium tracking-wide">
                Mobile Access Card Info
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="absolute right-0 text-gray-300 transition-colors hover:text-white">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            {/* Powered By */}
            <p className="text-base">Powered By</p>
            <div className="mt-2 border-b border-gray-700" />

            {/* Habitap wordmark */}
            <div className="flex justify-center py-10">
              <span className="text-5xl font-light tracking-tight text-emerald-700">Habitap</span>
            </div>

            {/* SEOS by ASSA ABLOY (text attribution, not the trademarked logo asset) */}
            <div className="flex flex-col items-center gap-1 pb-8">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-bold lowercase tracking-tight">seos</span>
                <span className="mb-1.5 text-lg font-light">by</span>
              </div>
              <span className="text-2xl font-extrabold uppercase tracking-tight">ASSA ABLOY</span>
            </div>

            {/* details — honest, since the HRMS can't read the device's SEOS card */}
            <DialogPrimitive.Description className="mt-4 space-y-2 border-t border-gray-800 pt-5 text-center text-sm leading-relaxed text-gray-300">
              <span className="block">
                Building access for{" "}
                <span className="font-medium text-white">{holderName ?? "you"}</span>
                {employeeId ? ` · Staff ID ${employeeId}` : ""}
              </span>
              <span className="block text-gray-400">
                Your entry PIN is emailed to you and is valid only for the dates shown on your pass.
              </span>
              <span className="block text-xs text-gray-500">
                Your live mobile access card lives in the Habitap app, powered by SEOS&trade; by ASSA
                ABLOY.
              </span>
            </DialogPrimitive.Description>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
