import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  Inbox,
  Send,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import {
  differenceInCalendarDays,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { Card } from "@/components/ui/card";
import { InviteStatusPill } from "@/components/staff/invite-status-pill";
import { WoodsSquareStaffActions } from "@/components/staff/woods-square-staff-actions";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

type PassState = "ACTIVE" | "UPCOMING" | "EXPIRED";

/** "dd MMM yyyy" → start-of-day Date. */
function parseHabitap(d: string): Date {
  return startOfDay(parse(d, "dd MMM yyyy", new Date()));
}

/** Where a window sits relative to `today`, or null if the dates don't parse. */
function passState(from: string, to: string, today: Date): PassState | null {
  const f = parseHabitap(from);
  const t = parseHabitap(to);
  if (!isValid(f) || !isValid(t)) return null;
  if (today < f) return "UPCOMING";
  if (today > t) return "EXPIRED";
  return "ACTIVE";
}

/** Colour + label for each pass state (shared by the hero pill and the table badges). */
const STATE_BADGE: Record<PassState, { label: string; cls: string; dot: string }> = {
  ACTIVE: {
    label: "Active now",
    cls: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  UPCOMING: {
    label: "Upcoming",
    cls: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
    dot: "bg-amber-400",
  },
  EXPIRED: {
    label: "Expired",
    cls: "bg-gray-500/15 text-gray-400 ring-1 ring-gray-600/40",
    dot: "bg-gray-500",
  },
};

function StatePill({ state, className = "" }: { state: PassState; className?: string }) {
  const s = STATE_BADGE[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default async function StaffInvitesPage({ params }: { params: { id: string } }) {
  let role = "STAFF";
  if (isDevAuthSkipped()) {
    role = "ADMIN";
  } else {
    const session = await auth();
    if (!session?.user) redirect("/login");
    role = session.user.role;
  }
  if (!hasAdminAccess(role) || (await getViewMode()) !== "admin") redirect("/dashboard");

  const employee = await prisma.employee.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, employeeId: true, woodsSquareInvite: true },
  });
  if (!employee) notFound();

  const invites = await prisma.habitapInviteLog.findMany({
    where: { OR: [{ employeeId: employee.id }, { email: employee.email }] },
    orderBy: { createdAt: "desc" },
  });

  const sentCount = invites.filter((i) => i.status === "SENT").length;
  const failedCount = invites.filter((i) => i.status === "FAILED").length;

  // "Today" in Singapore time, so pass-state math matches the rest of the app.
  const today = startOfDay(
    parseISO(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date())),
  );

  // The pass that matters most right now: active > soonest upcoming > most recent.
  // (invites are already newest-first, so withState[0] is the most recent.)
  const sentWithState = invites
    .filter((i) => i.status === "SENT")
    .map((i) => ({ inv: i, state: passState(i.fromDate, i.toDate, today) }))
    .filter((x): x is { inv: (typeof invites)[number]; state: PassState } => x.state !== null);
  const primary =
    sentWithState.find((x) => x.state === "ACTIVE") ??
    sentWithState
      .filter((x) => x.state === "UPCOMING")
      .sort((a, b) => +parseHabitap(a.inv.fromDate) - +parseHabitap(b.inv.fromDate))[0] ??
    sentWithState[0] ??
    null;

  // A short "ends in N days" / "starts in N days" note for the current-pass card.
  let passNote = "";
  if (primary) {
    if (primary.state === "ACTIVE") {
      const left = differenceInCalendarDays(parseHabitap(primary.inv.toDate), today);
      passNote = left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`;
    } else if (primary.state === "UPCOMING") {
      const d = differenceInCalendarDays(parseHabitap(primary.inv.fromDate), today);
      passNote = d === 0 ? "Starts today" : `Starts in ${d} day${d === 1 ? "" : "s"}`;
    } else {
      passNote = `Ended ${primary.inv.toDate}`;
    }
  }

  // Show the Send/Resend actions only for people who can actually be invited: a real
  // email AND on the Woods Square roster (matches the server-side guard). Off-roster
  // staff are view-only here — they can never be sent an invite.
  const canInvite =
    !!employee.email && !employee.email.includes(".noemail@") && employee.woodsSquareInvite;
  // Resend acts on the SAME pass shown in the "Current pass" card (active > soonest
  // upcoming > most recent), so what the admin sees is what gets re-issued.
  const currentPass = primary ? { fromDate: primary.inv.fromDate, toDate: primary.inv.toDate } : null;

  return (
    <div className="space-y-6">
      <Link
        href="/woods-square"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Woods Square Invite
      </Link>

      {/* Hero */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-indigo-600/5 border border-indigo-500/20 flex items-center justify-center text-indigo-300 text-xl font-bold shrink-0">
          {initials(employee.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{employee.name}</h1>
            {primary ? (
              <StatePill state={primary.state} />
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-400 ring-1 ring-gray-700">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-600" />
                No pass
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-1 truncate">
            {employee.email} · {employee.employeeId}
          </p>
        </div>
        {canInvite && (
          <div className="ml-auto shrink-0">
            <WoodsSquareStaffActions
              employeeId={employee.id}
              employeeName={employee.name}
              email={employee.email}
              currentPass={currentPass}
            />
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Invites sent */}
        <Card className="bg-gray-950 border-gray-800 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
            <Send className="h-3.5 w-3.5" />
            Invites sent
          </div>
          <p className="mt-1.5 text-2xl font-bold text-indigo-400 tabular-nums">{sentCount}</p>
        </Card>

        {/* Failed */}
        <Card className="bg-gray-950 border-gray-800 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            Failed
          </div>
          <p
            className={`mt-1.5 text-2xl font-bold tabular-nums ${
              failedCount > 0 ? "text-red-400" : "text-gray-600"
            }`}
          >
            {failedCount}
          </p>
        </Card>

        {/* Current pass (replaces the old most-recent "Latest access window") */}
        <Card className="bg-gray-950 border-gray-800 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
            <KeyRound className="h-3.5 w-3.5" />
            Current pass
          </div>
          {primary ? (
            <>
              <p className="mt-1.5 text-base font-semibold text-white tabular-nums">
                {primary.inv.fromDate} – {primary.inv.toDate}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <StatePill state={primary.state} />
                {passNote && <span className="text-xs text-gray-500">{passNote}</span>}
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-base font-semibold text-gray-600">No pass</p>
          )}
        </Card>
      </div>

      {/* Invite history */}
      <Card className="bg-gray-950 border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <CalendarRange className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Invite history</h2>
          <span className="text-xs text-gray-500">({invites.length})</span>
        </div>

        {invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-14 px-4">
            <div className="h-12 w-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-3">
              <Inbox className="h-5 w-5 text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-300">No invites yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              This staff member hasn&rsquo;t been sent a Woods Square invite. Send one from the{" "}
              <Link href="/woods-square" className="text-indigo-400 hover:underline">
                invite page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 bg-gray-900/40 border-b border-gray-800">
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Sent</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Access window</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Event</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {invites.map((inv) => {
                  const rowState = inv.status === "SENT" ? passState(inv.fromDate, inv.toDate, today) : null;
                  return (
                    <tr key={inv.id} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{fmt(inv.createdAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-white tabular-nums">
                            {inv.fromDate} – {inv.toDate}
                          </span>
                          {rowState && <StatePill state={rowState} />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {inv.eventId ? `#${inv.eventId}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <InviteStatusPill status={inv.status} title={inv.error ?? undefined} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
