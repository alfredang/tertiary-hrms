import { format, parse, parseISO } from "date-fns";
import { prisma } from "@/lib/prisma";
// Types only — the runtime Playwright/Habitap module is imported lazily inside the send
// (below) so it never gets pulled into the instrumentation/timer bundle (Playwright can't
// be webpacked there). It's loaded on demand, only when a send actually runs.
import type { EventWindow, StaffInvitee } from "@/lib/habitap";
import { withLock } from "@/lib/process-lock";
import { HABITAP_DATE_FMT, coveringRange, gapWindows } from "@/lib/woods-square";

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
export const SEND_LOCK_KEY = "woods-square-send";
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

  // Dedup: skip staff only when the requested window is ALREADY FULLY COVERED by their
  // existing invites — judged by the UNION of all their prior SENT windows, not a single
  // row. So a month split across several invites (any date boundaries) still counts as
  // covered and won't be re-sent; the scheduler stays idempotent. A resend deliberately
  // re-issues a covered window, so it skips this entirely.
  const DATE_FMT = HABITAP_DATE_FMT;
  const conflictByEmail = new Map<string, { from: string; to: string }>();
  if (!resend) {
    const reqFrom = parse(win.fromDate, DATE_FMT, new Date());
    const reqTo = parse(win.toDate, DATE_FMT, new Date());
    const priorSent = await prisma.habitapInviteLog.findMany({
      where: { status: "SENT", email: { in: invitees.map((i) => i.email) } },
      select: { email: true, fromDate: true, toDate: true },
    });
    // Group each person's prior windows, then test whether their union covers the request.
    const rangesByEmail = new Map<string, { from: Date; to: Date }[]>();
    for (const p of priorSent) {
      const key = p.email.toLowerCase();
      const list = rangesByEmail.get(key) ?? [];
      list.push({ from: parse(p.fromDate, DATE_FMT, new Date()), to: parse(p.toDate, DATE_FMT, new Date()) });
      rangesByEmail.set(key, list);
    }
    rangesByEmail.forEach((ranges, key) => {
      const cover = coveringRange(ranges, reqFrom, reqTo);
      if (cover) {
        conflictByEmail.set(key, { from: format(cover.from, DATE_FMT), to: format(cover.to, DATE_FMT) });
      }
    });
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

const isoToHabitap = (iso: string) => format(parseISO(iso), HABITAP_DATE_FMT);

/**
 * Gap-aware send — the entry point ALL triggers use (manual admin send, single/bulk
 * request approval, test, and the monthly scheduler). For each invitee it sends only the
 * ≤7-day sub-windows of the requested window they don't already have (people fully covered
 * are skipped, partially-covered get just their missing days — no overlapping PINs). People
 * who share an identical missing sub-window are batched into one Habitap event, so a window
 * everyone needs stays a single send. Each sub-window runs through the proven
 * `runWoodsSquareSend` core (which keeps its own union-dedup as an idempotency safety net).
 *
 * `resend` bypasses all of this and re-issues the exact window, as before.
 */
export async function runWoodsSquareSendGapAware(opts: {
  staffIds: string[];
  window: EventWindow;
  resend?: boolean;
}): Promise<SendOutcome> {
  if (opts.resend) return runWoodsSquareSend(opts);

  const invitees = await resolveInvitees(opts.staffIds);
  if (invitees.length === 0) {
    return { ok: false, status: 400, error: "No matching staff on the Woods Square invite roster." };
  }

  const reqFromIso = format(parse(opts.window.fromDate, HABITAP_DATE_FMT, new Date()), "yyyy-MM-dd");
  const reqToIso = format(parse(opts.window.toDate, HABITAP_DATE_FMT, new Date()), "yyyy-MM-dd");

  // Each person's prior SENT coverage, keyed by the delivery email the send will use.
  const priorSent = await prisma.habitapInviteLog.findMany({
    where: { status: "SENT", email: { in: invitees.map((i) => i.email) } },
    select: { email: true, fromDate: true, toDate: true },
  });
  const coverageByEmail = new Map<string, { from: Date; to: Date }[]>();
  for (const p of priorSent) {
    const key = p.email.toLowerCase();
    const list = coverageByEmail.get(key) ?? [];
    list.push({
      from: parse(p.fromDate, HABITAP_DATE_FMT, new Date()),
      to: parse(p.toDate, HABITAP_DATE_FMT, new Date()),
    });
    coverageByEmail.set(key, list);
  }

  // Per person → missing sub-windows within the requested range; group people who need the
  // SAME sub-window so each distinct window is one Habitap event, not one per person.
  const byWindow = new Map<string, { fromIso: string; toIso: string; ids: string[] }>();
  const fullyCovered: Invitee[] = [];
  for (const inv of invitees) {
    const gaps = gapWindows(reqFromIso, reqToIso, coverageByEmail.get(inv.email.toLowerCase()) ?? []);
    if (gaps.length === 0) {
      fullyCovered.push(inv);
      continue;
    }
    for (const g of gaps) {
      const key = `${g.from}|${g.to}`;
      const grp = byWindow.get(key) ?? { fromIso: g.from, toIso: g.to, ids: [] };
      grp.ids.push(inv.id);
      byWindow.set(key, grp);
    }
  }

  // Fully-covered people show up as "skipped" (already have these dates), mirroring the
  // core's own skip shape so the UI/toast read identically — and get a SKIPPED log row so
  // the activity log keeps a trail of blocked sends (the core would log these, but the gap
  // path handles fully-covered people before reaching it).
  const skippedCovered = fullyCovered.map((i) => ({
    name: i.name,
    email: i.email,
    existingFrom: opts.window.fromDate,
    existingTo: opts.window.toDate,
  }));
  if (fullyCovered.length > 0) {
    await prisma.habitapInviteLog.createMany({
      data: fullyCovered.map((i) => ({
        employeeId: i.id,
        name: i.name,
        email: i.email,
        eventId: null,
        fromDate: opts.window.fromDate,
        toDate: opts.window.toDate,
        status: "SKIPPED",
        error: `Already covered for ${opts.window.fromDate} – ${opts.window.toDate}`,
      })),
    });
  }

  // Send each distinct sub-window through the core, earliest first, and aggregate.
  const groups = Array.from(byWindow.values()).sort((a, b) => a.fromIso.localeCompare(b.fromIso));
  const agg: SendResult = {
    eventId: null,
    invitedCount: 0,
    failedCount: 0,
    skippedCount: skippedCovered.length,
    skipped: [...skippedCovered],
    failed: [],
  };
  let anyOk = false;
  let lastError: { status: number; error: string } | null = null;
  const failedIds = new Set<string>();
  for (const g of groups) {
    const outcome = await runWoodsSquareSend({
      staffIds: g.ids,
      window: { ...opts.window, fromDate: isoToHabitap(g.fromIso), toDate: isoToHabitap(g.toIso) },
    });
    if (outcome.ok) {
      anyOk = true;
      agg.eventId = agg.eventId ?? outcome.eventId;
      agg.invitedCount += outcome.invitedCount;
      agg.failedCount += outcome.failedCount;
      agg.skippedCount += outcome.skippedCount;
      agg.skipped.push(...outcome.skipped);
      agg.failed.push(...outcome.failed);
    } else {
      // A whole sub-window failed (e.g. automation error — the core already logged FAILED
      // rows). Surface its people as failures, and remember them so a request is NEVER
      // marked fulfilled below while its PIN didn't actually send.
      lastError = { status: outcome.status, error: outcome.error };
      const byId = new Map(invitees.map((i) => [i.id, i]));
      for (const id of g.ids) {
        failedIds.add(id);
        const inv = byId.get(id);
        if (inv) agg.failed.push({ invitee: { name: inv.name, email: inv.email }, error: outcome.error });
      }
      agg.failedCount += g.ids.length;
    }
  }

  // Resolve PENDING access requests now fully covered by the REQUESTED window. Gap-splitting
  // means no single sub-window may contain the request, so the core's per-window fulfilment
  // can miss it — do it here at the original-window level. Only for people genuinely covered:
  // those already fully covered, plus those whose every missing sub-window sent OK. Anyone
  // with a failed sub-window is excluded, so a request can't read "Fulfilled" without a PIN.
  const coveredIds = Array.from(
    new Set([...fullyCovered.map((i) => i.id), ...groups.flatMap((g) => g.ids)]),
  ).filter((id) => !failedIds.has(id));
  if (coveredIds.length > 0) {
    const reqFromDate = parseISO(reqFromIso);
    const reqToDate = parseISO(reqToIso);
    const pending = await prisma.accessRequest.findMany({
      where: { status: "PENDING", employeeId: { in: coveredIds } },
      select: { id: true, fromDate: true, toDate: true },
    });
    const fulfillIds = pending
      .filter(
        (r) =>
          !r.fromDate ||
          !r.toDate ||
          (reqFromDate <= parseISO(r.fromDate) && reqToDate >= parseISO(r.toDate)),
      )
      .map((r) => r.id);
    if (fulfillIds.length > 0) {
      await prisma.accessRequest.updateMany({
        where: { id: { in: fulfillIds }, status: "PENDING" },
        data: { status: "FULFILLED", resolvedAt: new Date() },
      });
    }
  }

  // Nobody had a gap → nothing was sent (everyone already covered for this window).
  if (groups.length === 0) {
    return {
      ok: true,
      eventId: null,
      invitedCount: 0,
      failedCount: 0,
      skippedCount: skippedCovered.length,
      skipped: skippedCovered,
      failed: [],
    };
  }
  // Every sub-window hard-failed and nobody was invited → surface the error like the core.
  if (!anyOk && lastError) return { ok: false, ...lastError };
  return { ok: true, ...agg };
}
