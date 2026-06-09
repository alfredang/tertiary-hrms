import { NextRequest, NextResponse } from "next/server";
import { parse, parseISO } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import {
  generateStaffInvites,
  getHabitapCredentials,
  type EventWindow,
  type StaffInvitee,
} from "@/lib/habitap";

// Playwright needs the Node runtime and time to drive a real browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Single-flight guard: only one browser-driven send runs at a time per server
// instance, so two clicks can't spin up two Chromium processes and spike memory.
let sendInFlight = false;

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return hasAdminAccess(session.user.role);
}

interface Body {
  /** Specific employee ids to invite. Omit to invite all ACTIVE staff with an email. */
  staffIds?: string[];
  /** Event date/time window — required unless dryRun. */
  window?: EventWindow;
  /** When true, resolve the staff list and echo it back without touching Habitap. */
  dryRun?: boolean;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  // Resolve the staff batch.
  const employees = await prisma.employee.findMany({
    where: {
      email: { not: "" },
      ...(body.staffIds?.length ? { id: { in: body.staffIds } } : { status: "ACTIVE" }),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const invitees: (StaffInvitee & { id: string })[] = employees
    .filter((e) => e.email && !e.email.includes(".noemail@"))
    .map((e) => ({ id: e.id, name: e.name, email: e.email }));

  if (invitees.length === 0) {
    return NextResponse.json({ error: "No staff with an email address matched." }, { status: 400 });
  }

  // Dry run: preview who would be invited without writing to Habitap.
  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      count: invitees.length,
      invitees: invitees.map(({ name, email }) => ({ name, email })),
    });
  }

  const win = body.window;
  if (!win) {
    return NextResponse.json({ error: "Missing event window (dates/times)." }, { status: 400 });
  }

  const creds = await getHabitapCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "Woods Square credentials not set. Add HABITAP_USERNAME / HABITAP_PASSWORD in Settings → Credentials." },
      { status: 400 },
    );
  }

  // Dedup: skip staff only when the requested window is ALREADY FULLY COVERED by an
  // existing invite (containment) — so re-sending the same/subset window is blocked,
  // but extending it (e.g. 1 Jul → 1–3 Jul) is allowed through.
  const DATE_FMT = "dd MMM yyyy";
  const reqFrom = parse(win.fromDate, DATE_FMT, new Date());
  const reqTo = parse(win.toDate, DATE_FMT, new Date());
  const priorSent = await prisma.habitapInviteLog.findMany({
    where: { status: "SENT", email: { in: invitees.map((i) => i.email) } },
    select: { email: true, fromDate: true, toDate: true },
  });
  // First existing window that fully covers the request becomes the "conflict".
  // Keyed by lowercased email so a case difference between the log and the
  // employee record can't slip a duplicate past the dedup.
  const conflictByEmail = new Map<string, { from: string; to: string }>();
  for (const p of priorSent) {
    const key = p.email.toLowerCase();
    if (conflictByEmail.has(key)) continue;
    const existFrom = parse(p.fromDate, DATE_FMT, new Date());
    const existTo = parse(p.toDate, DATE_FMT, new Date());
    if (existFrom <= reqFrom && existTo >= reqTo) {
      conflictByEmail.set(key, { from: p.fromDate, to: p.toDate });
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
    return NextResponse.json({
      eventId: null,
      invitedCount: 0,
      failedCount: 0,
      skippedCount: skipped.length,
      skipped,
      failed: [],
    });
  }

  if (sendInFlight) {
    return NextResponse.json(
      { error: "A Woods Square send is already running. Please wait a moment and try again." },
      { status: 409 },
    );
  }
  sendInFlight = true;
  let result;
  try {
    result = await generateStaffInvites(creds, toInvite, win);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Woods Square automation failed: ${message}` }, { status: 502 });
  } finally {
    sendInFlight = false;
  }

  // Stamp invited employees (match back by email).
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

  // Notify every invited staff member (check email for PIN), and close any pending requests.
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
        type: "INFO",
        link: "/profile",
      })),
    });
    // Only close pending requests this send actually satisfies: a request with
    // no specific dates is fulfilled by any grant; a dated request only if the
    // sent window fully covers it. Other pending requests stay open.
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
        where: { id: { in: coveredIds } },
        data: { status: "FULFILLED", resolvedAt: invitedAt },
      });
    }
  }

  return NextResponse.json({
    eventId: result.eventId,
    invitedCount: result.invited.length,
    failedCount: result.failed.length,
    skippedCount: skipped.length,
    skipped,
    failed: result.failed,
  });
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const logs = await prisma.habitapInviteLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // Attach each logged staff member's roles (the log has no Employee relation).
  const ids = Array.from(new Set(logs.map((l) => l.employeeId).filter((x): x is string => Boolean(x))));
  const emps = ids.length
    ? await prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, user: { select: { roles: true } } },
      })
    : [];
  const rolesById = new Map(emps.map((e) => [e.id, e.user.roles]));
  const enriched = logs.map((l) => ({
    ...l,
    roles: l.employeeId ? rolesById.get(l.employeeId) ?? [] : [],
  }));
  return NextResponse.json({ logs: enriched });
}
