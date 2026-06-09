"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, Mail, ChevronDown } from "lucide-react";
import { parse, parseISO, format, differenceInCalendarDays, startOfDay } from "date-fns";
import { Card } from "@/components/ui/card";
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

const ACCESS_STATE = {
  ACTIVE: { label: "Active now", cls: "bg-emerald-500/15 text-emerald-400", dot: "bg-emerald-400" },
  UPCOMING: { label: "Upcoming", cls: "bg-amber-500/15 text-amber-400", dot: "bg-amber-400" },
  EXPIRED: { label: "Expired", cls: "bg-red-500/15 text-red-400", dot: "bg-red-400" },
} as const;

const REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-amber-500/15 text-amber-400" },
  FULFILLED: { label: "Fulfilled", cls: "bg-emerald-500/15 text-emerald-400" },
  DECLINED: { label: "Declined", cls: "bg-red-500/15 text-red-400" },
};

function accessState(fromStr: string, toStr: string): keyof typeof ACCESS_STATE {
  const today = startOfDay(new Date());
  const from = startOfDay(parse(fromStr, "dd MMM yyyy", new Date()));
  const to = startOfDay(parse(toStr, "dd MMM yyyy", new Date()));
  if (today < from) return "UPCOMING";
  if (today > to) return "EXPIRED";
  return "ACTIVE";
}

function fmtIso(iso: string): string {
  try {
    return format(parseISO(iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

function shortDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function WoodsSquareAccessCard({
  invites,
  requests,
}: {
  invites: InviteRow[];
  requests: RequestRow[];
}) {
  const router = useRouter();
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const hasPending = requests.some((r) => r.status === "PENDING");
  const isEmpty = invites.length === 0 && requests.length === 0;

  async function cancelRequest(id: string) {
    setCancelling(id);
    try {
      await fetch(`/api/woods-square/access-requests/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setCancelling(null);
    }
  }

  return (
    <Card className="bg-gray-950 border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Woods Square Access</h2>
        </div>
        <RequestAccessButton hasPending={hasPending} />
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center text-center py-12 px-4">
          <div className="h-12 w-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-3">
            <KeyRound className="h-5 w-5 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-300">No building access yet</p>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            Request access above, or once you&rsquo;re given Woods Square access your entry PIN is
            emailed to you and the pass shows up here.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {/* Passes */}
          {invites.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 bg-indigo-950/20 border border-indigo-900/40 rounded-lg px-3 py-2.5">
                <Mail className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-300">
                  Your entry <span className="font-medium text-white">PIN is emailed to you</span> for
                  each pass — check your inbox and spam. Lost it? Ask an admin to resend.
                </p>
              </div>

              <div className="space-y-2">
                {invites.map((inv) => {
                  const state = ACCESS_STATE[accessState(inv.fromDate, inv.toDate)];
                  const days =
                    differenceInCalendarDays(
                      parse(inv.toDate, "dd MMM yyyy", new Date()),
                      parse(inv.fromDate, "dd MMM yyyy", new Date()),
                    ) + 1;
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2.5 transition-colors hover:border-gray-700 hover:bg-gray-900/70"
                    >
                      <div className="h-9 w-9 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                        <KeyRound className="h-4 w-4 text-indigo-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">
                          {inv.fromDate} – {inv.toDate}
                        </p>
                        <p className="text-xs text-gray-500">
                          {days} day{days === 1 ? "" : "s"} · sent {shortDate(inv.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shrink-0 ${state.cls}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
                        {state.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* My requests (collapsed by default) */}
          {requests.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setRequestsOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${requestsOpen ? "" : "-rotate-90"}`}
                />
                My requests <span className="text-gray-600">({requests.length})</span>
              </button>
              {requestsOpen && (
                <div className="space-y-2">
                  {requests.map((r) => {
                    const badge = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white">
                            {r.fromDate && r.toDate
                              ? `${fmtIso(r.fromDate)} – ${fmtIso(r.toDate)}`
                              : "No specific dates"}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            Requested {shortDate(r.createdAt)}
                            {r.note ? ` · “${r.note}”` : ""}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium shrink-0 ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {r.status === "PENDING" && (
                          <button
                            onClick={() => cancelRequest(r.id)}
                            disabled={cancelling === r.id}
                            className="text-xs text-gray-400 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50"
                          >
                            {cancelling === r.id ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
