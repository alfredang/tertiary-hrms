import { parse, parseISO } from "date-fns";
import { prisma } from "@/lib/prisma";
// Types only — the runtime Playwright/Habitap module is imported lazily inside the send
// (below) so it never gets pulled into the instrumentation/timer bundle (Playwright can't
// be webpacked there). It's loaded on demand, only when a send actually runs.
import type { EventWindow, StaffInvitee } from "@/lib/habitap";
import { withLock } from "@/lib/process-lock";
import { HABITAP_DATE_FMT } from "@/lib/woods-square";

/**
 * Shared Woods Square send-core — the single path that both the manual admin send
 * (/api/habitap/generate-pin) and the monthly scheduler call. Keeping it in one place
 * means the roster guard, status filter, delivery-email override, dedup, locking,
 * logging, notifications and request-fulfillment behave identically everywhere.
 */

// Single-flight guard (DB-backed, holds across instances) so two triggers can't spin
// up two Chromium processes / create duplicate events. TTL must sit past the LARGEST
// route maxDuration (the cron route allows 600s) so a long-but-healthy send can never
// have its lock auto-expire mid-run and let a second trigger launch a concurrent
// Chromium / duplicate event. A crashed holder's lock still auto-frees once TTL passes.
const SEND_LOCK_KEY = "woods-square-send";
const SEND_LOCK_TTL_MS = 660_000; // 11 min — safely above the 600s (10 min) cron maxDuration

// People who've left can never be invited (critical for the unattended scheduler).
const LEFT_STATUSES = ["TERMINATED", "RESIGNED", "INACTIVE"];

export type Invitee = StaffInvitee & { id: string };

/**
 * Resolve which of the given employee ids may actually be invited: on the roster,
 * not left, and with a usable delivery address (the per-person override if set,
 * otherwise the account email).
 */
export async function resolveInvitees(staffIds: string[]): Promise<Invitee[]> {
  const employees = await prisma.employee.findMany({
    where: { email: { not: "" }, id: { in: staffIds } },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      woodsSquareInvite: true,
      woodsSquareEmail: true,
    },
    orderBy: { name: "asc" },
  });
  return employees
    .filter((e) => e.woodsSquareInvite)
    .filter((e) => !LEFT_STATUSES.includes(e.status))
    .map((e) => ({ id: e.id, name: e.name, email: e.woodsSquareEmail || e.email }))
    .filter((i) => i.email && !i.email.includes(".noemail@"));
}

export interface SendResult {
  eventId: string | null;
  invitedCount: number;
  failedCount: number;
  skippedCount: number;
  skipped: { name: string; email: string; existingFrom: string; existingTo: string }[];
  failed: { invitee: { name: string; email: string }; error: string }[];
}

export type SendOutcome = ({ ok: true } & SendResult) | { ok: false; status: number; error: string };

/**
 * Resolve → dedup → (locked) drive Habitap → stamp/log/notify/fulfill, for one window.
 * Caller supplies an explicit, already-validated id list + window. Returns a result or
 * a structured error (the HTTP routes map `status` straight onto the response).
 */
export async function runWoodsSquareSend(opts: {
  staffIds: string[];
  window: EventWindow;
  resend?: boolean;
}): Promise<SendOutcome> {
  const { staffIds, window: win, resend } = opts;

  // Lazy-load the Playwright-backed Habitap client (keeps it out of the timer bundle).
  const { generateStaffInvites, getHabitapCredentials } = await import("@/lib/habitap");

  const invitees = await resolveInvitees(staffIds);
  if (invitees.length === 0) {
    return { ok: false, status: 400, error: "No matching staff on the Woods Square invite roster." };
  }

  const creds = await getHabitapCredentials();
  if (!creds) {
    return {
      ok: false,
      status: 400,
      error:
        "Woods Square credentials not set. Add HABITAP_USERNAME / HABITAP_PASSWORD in Settings → Credentials.",
    };
  }

  // Dedup: skip staff only when the requested window is ALREADY FULLY COVERED by an
  // existing invite (containment). A resend deliberately re-issues a covered window.
  const DATE_FMT = HABITAP_DATE_FMT;
  const conflictByEmail = new Map<string, { from: string; to: string }>();
  if (!resend) {
    const reqFrom = parse(win.fromDate, DATE_FMT, new Date());
    const reqTo = parse(win.toDate, DATE_FMT, new Date());
    const priorSent = await prisma.habitapInviteLog.findMany({
      where: { status: "SENT", email: { in: invitees.map((i) => i.email) } },
      select: { email: true, fromDate: true, toDate: true },
    });
    for (const p of priorSent) {
      const key = p.email.toLowerCase();
      if (conflictByEmail.has(key)) continue;
      const existFrom = parse(p.fromDate, DATE_FMT, new Date());
      const existTo = parse(p.toDate, DATE_FMT, new Date());
      if (existFrom <= reqFrom && existTo >= reqTo) {
        conflictByEmail.set(key, { from: p.fromDate, to: p.toDate });
      }
    }
  }
  const toInvite = invitees.filter((i) => !conflictByEmail.has(i.email.toLowerCase()));
  const skippedInvitees = invitees.filter((i) => conflictByEmail.has(i.email.toLowerCase()));
  const skipped = skippedInvitees.map(({ name, email }) => {
    const c = conflictByEmail.get(email.toLowerCase())!;
    return { name, email, existingFrom: c.from, existingTo: c.to };
  });

  // Record skipped attempts in the log so there's a trail of blocked sends.
  if (skippedInvitees.length > 0) {
    await prisma.habitapInviteLog.createMany({
      data: skippedInvitees.map((i) => {
        const c = conflictByEmail.get(i.email.toLowerCase())!;
        return {
          employeeId: i.id,
          name: i.name,
          email: i.email,
          eventId: null,
          fromDate: win.fromDate,
          toDate: win.toDate,
          status: "SKIPPED",
          error: `Already covered by ${c.from} – ${c.to}`,
        };
      }),
    });
  }

  if (toInvite.length === 0) {
    return { ok: true, eventId: null, invitedCount: 0, failedCount: 0, skippedCount: skipped.length, skipped, failed: [] };
  }

  let send;
  try {
    send = await withLock(SEND_LOCK_KEY, SEND_LOCK_TTL_MS, () =>
      generateStaffInvites(creds, toInvite, win),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Leave a trail so a whole-event failure is visible in the log instead of a silent
    // gap, and a re-run can retry it (dedup only skips SENT, never FAILED).
    await prisma.habitapInviteLog.createMany({
      data: toInvite.map((i) => ({
        employeeId: i.id,
        name: i.name,
        email: i.email,
        eventId: null,
        fromDate: win.fromDate,
        toDate: win.toDate,
        status: "FAILED",
        error: message.slice(0, 500),
      })),
    });
    return { ok: false, status: 502, error: `Woods Square automation failed: ${message}` };
  }
  if (!send.ran) {
    return {
      ok: false,
      status: 409,
      error: "A Woods Square send is already running. Please wait a moment and try again.",
    };
  }
  const result = send.result;

  // Stamp invited employees (match back by the address we sent to).
  const invitedAt = new Date();
  const byEmail = new Map(toInvite.map((i) => [i.email, i.id]));
  await Promise.all(
    result.invited.map((i) => {
      const id = byEmail.get(i.email);
      if (!id) return Promise.resolve();
      return prisma.employee.update({
        where: { id },
        data: { habitapInviteAt: invitedAt, habitapEventId: result.eventId },
      });
    }),
  );

  // Write a log row per invitee (sent + failed).
  await prisma.habitapInviteLog.createMany({
    data: [
      ...result.invited.map((i) => ({
        employeeId: byEmail.get(i.email) ?? null,
        name: i.name,
        email: i.email,
        eventId: result.eventId,
        fromDate: win.fromDate,
        toDate: win.toDate,
        status: "SENT",
      })),
      ...result.failed.map((f) => ({
        employeeId: byEmail.get(f.invitee.email) ?? null,
        name: f.invitee.name,
        email: f.invitee.email,
        eventId: result.eventId,
        fromDate: win.fromDate,
        toDate: win.toDate,
        status: "FAILED",
        error: f.error,
      })),
    ],
  });

  // Notify every invited staff member (check email for PIN), and close requests this
  // send actually satisfies.
  const invitedIds = result.invited
    .map((i) => byEmail.get(i.email))
    .filter((id): id is string => Boolean(id));
  if (invitedIds.length > 0) {
    const emps = await prisma.employee.findMany({
      where: { id: { in: invitedIds } },
      select: { userId: true },
    });
    await prisma.notification.createMany({
      data: emps.map((e) => ({
        userId: e.userId,
        title: "Woods Square Access Approved",
        message: `Your building access for ${win.fromDate} – ${win.toDate} was approved — check your email for the PIN.`,
        type: "WOODS_SQUARE_APPROVED",
        link: "/woods-square-access",
      })),
    });
    const pendingReqs = await prisma.accessRequest.findMany({
      where: { status: "PENDING", employeeId: { in: invitedIds } },
      select: { id: true, fromDate: true, toDate: true },
    });
    const sentFrom = parse(win.fromDate, DATE_FMT, new Date());
    const sentTo = parse(win.toDate, DATE_FMT, new Date());
    const coveredIds = pendingReqs
      .filter((r) => {
        if (!r.fromDate || !r.toDate) return true;
        return sentFrom <= parseISO(r.fromDate) && sentTo >= parseISO(r.toDate);
      })
      .map((r) => r.id);
    if (coveredIds.length > 0) {
      await prisma.accessRequest.updateMany({
        where: { id: { in: coveredIds }, status: "PENDING" },
        data: { status: "FULFILLED", resolvedAt: invitedAt },
      });
    }
  }

  return {
    ok: true,
    eventId: result.eventId,
    invitedCount: result.invited.length,
    failedCount: result.failed.length,
    skippedCount: skipped.length,
    skipped,
    failed: result.failed,
  };
}
