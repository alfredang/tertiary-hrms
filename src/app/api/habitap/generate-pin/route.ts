import { NextRequest, NextResponse } from "next/server";
import { differenceInCalendarDays, isValid, parse, parseISO } from "date-fns";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { HABITAP_DATE_FMT, MAX_WINDOW_DAYS } from "@/lib/woods-square";
import { resolveInvitees, runWoodsSquareSendGapAware } from "@/lib/woods-square-send";

// Playwright needs the Node runtime and time to drive a real browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 600s — matches the cron/run-now routes and sits UNDER the 660s send-lock TTL, so a big
// "Invite All" with fragmented coverage finishes and releases the lock cleanly instead of
// being killed at 300s mid-send (which wedged the lock ~11 min, blocking all sends). (#6)
export const maxDuration = 600;

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return hasAdminAccess(session.user.role);
}

// Validate the request server-side — the 7-day cap and date format were previously
// only enforced in the UI, so a crafted POST could slip an invalid window through.
const eventWindowSchema = z
  .object({
    eventName: z.string().max(40).optional(),
    venueValue: z.string().optional(),
    fromDate: z.string(),
    fromTime: z.string().min(1),
    toDate: z.string(),
    toTime: z.string().min(1),
    message: z.string().max(500).optional(),
  })
  .superRefine((w, ctx) => {
    const from = parse(w.fromDate, HABITAP_DATE_FMT, new Date());
    const to = parse(w.toDate, HABITAP_DATE_FMT, new Date());
    if (!isValid(from) || !isValid(to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Dates must look like "09 Jun 2026".' });
      return;
    }
    const days = differenceInCalendarDays(to, from) + 1;
    if (days < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after the start date.",
      });
    } else if (days > MAX_WINDOW_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Window must be ${MAX_WINDOW_DAYS} days or fewer.`,
      });
    }
    // Reject a window that's already fully in the past (e.g. inviting a stale request) —
    // Habitap rejects past dates, so catch it here with a clean error instead of a failed
    // automation run. "Today" is pinned to Singapore time to match the date pickers.
    const todayStart = parseISO(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date()),
    );
    if (isValid(to) && to < todayStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This access window has already passed." });
    }
  });

const generatePinSchema = z.object({
  /**
   * Employee ids to invite — REQUIRED and non-empty. There is deliberately no
   * "omit to invite everyone" fallback: a missing list must never silently fan a
   * real building-access PIN out to all staff. Callers always pass an explicit set.
   */
  staffIds: z.array(z.string().min(1)).min(1, "Select at least one staff member to invite."),
  /** Event date/time window — required unless dryRun. */
  window: eventWindowSchema.optional(),
  /** When true, resolve the staff list and echo it back without touching Habitap. */
  dryRun: z.boolean().optional(),
  /**
   * Resend an already-issued PIN to a staffer who lost theirs. Skips the
   * containment dedup (which would otherwise mark an already-covered window
   * SKIPPED and send nothing), so the invite email actually goes back out.
   */
  resend: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = generatePinSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Dry run: preview who would actually be invited, without touching Habitap.
  if (body.dryRun) {
    const invitees = await resolveInvitees(body.staffIds);
    if (invitees.length === 0) {
      return NextResponse.json(
        { error: "No matching staff on the Woods Square invite roster." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      dryRun: true,
      count: invitees.length,
      invitees: invitees.map(({ name, email }) => ({ name, email })),
    });
  }

  if (!body.window) {
    return NextResponse.json({ error: "Missing event window (dates/times)." }, { status: 400 });
  }

  // Hand off to the shared gap-aware send (same path the scheduler uses): each person
  // gets only the missing sub-windows of the requested range, never an overlapping PIN.
  const outcome = await runWoodsSquareSendGapAware({
    staffIds: body.staffIds,
    window: body.window,
    resend: body.resend,
  });
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  const { ok: _ok, ...result } = outcome;
  return NextResponse.json(result);
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
