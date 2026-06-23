import { NextRequest, NextResponse } from "next/server";
import { format, parse, parseISO } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { getCurrentUser, isAdminUser } from "@/lib/woods-square-auth";
import { MAX_PENDING_REQUESTS, MAX_WINDOW_DAYS, windowDaysInclusive } from "@/lib/woods-square";

// Dates are optional; an empty string from the form means "not set".
const optionalIsoDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.").optional(),
);

// Validate server-side — the optional window and 7-day cap were UI-only before.
const accessRequestSchema = z
  .object({
    fromDate: optionalIsoDate,
    toDate: optionalIsoDate,
    note: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
      z.string().max(300).optional(),
    ),
  })
  .superRefine((b, ctx) => {
    if (!!b.fromDate !== !!b.toDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide both dates or neither.",
        path: ["toDate"],
      });
      return;
    }
    if (b.fromDate && b.toDate) {
      // Reject windows that start in the past (yyyy-MM-dd strings sort chronologically).
      // Pin "today" to Singapore time so the check matches the SGT-based date pickers
      // and card date math — not the server's UTC clock.
      const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(
        new Date(),
      );
      if (b.fromDate < todayIso) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start date can’t be in the past.",
          path: ["fromDate"],
        });
      }
      const days = windowDaysInclusive(b.fromDate, b.toDate);
      if (days < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End date must be on or after the start date.",
          path: ["toDate"],
        });
      } else if (days > MAX_WINDOW_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Woods Square allows up to ${MAX_WINDOW_DAYS} days.`,
          path: ["toDate"],
        });
      }
    }
  });

export const dynamic = "force-dynamic";

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

// Staff creates an access request → notifies all admins.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.employee) {
    return NextResponse.json({ error: "No employee profile found." }, { status: 400 });
  }
  // Admins can't request — unless they're previewing the app as a non-admin role.
  const actualIsAdmin = (user.roles ?? []).some((r) => hasAdminAccess(r));
  if (actualIsAdmin && (await getViewMode()) === "admin") {
    return NextResponse.json(
      { error: "Admins send invites directly — they don't request access." },
      { status: 403 },
    );
  }

  // Only people on the Woods Square invite roster can be sent a pass, so block requests
  // from anyone off-roster up front — otherwise their request could never be fulfilled
  // and would sit PENDING forever, cluttering the admin queue.
  if (!user.employee.woodsSquareInvite) {
    return NextResponse.json(
      { error: "You're not set up for Woods Square building access. Please contact an admin." },
      { status: 403 },
    );
  }

  const parsed = accessRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Multiple pending requests are allowed, but capped so the admin queue doesn't
  // get flooded by one person. Past-dated PENDING requests are treated as expired and
  // don't count — otherwise stale ones would permanently block someone from requesting.
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const pendingCount = await prisma.accessRequest.count({
    where: {
      employeeId: user.employee.id,
      status: "PENDING",
      OR: [{ toDate: null }, { toDate: { gte: todayIso } }],
    },
  });
  if (pendingCount >= MAX_PENDING_REQUESTS) {
    return NextResponse.json(
      {
        error: `You can have at most ${MAX_PENDING_REQUESTS} pending requests at a time. Wait for some to be reviewed or cancel one.`,
      },
      { status: 409 },
    );
  }

  // If specific dates are given, block requests already fully covered by an existing pass.
  if (body.fromDate && body.toDate) {
    const reqFrom = parseISO(body.fromDate);
    const reqTo = parseISO(body.toDate);
    const sent = await prisma.habitapInviteLog.findMany({
      where: {
        status: "SENT",
        OR: [{ employeeId: user.employee.id }, { email: user.employee.email }],
      },
      select: { fromDate: true, toDate: true },
    });
    const covered = sent.find((s) => {
      try {
        const ef = parse(s.fromDate, "dd MMM yyyy", new Date());
        const et = parse(s.toDate, "dd MMM yyyy", new Date());
        return ef <= reqFrom && et >= reqTo;
      } catch {
        return false;
      }
    });
    if (covered) {
      return NextResponse.json(
        { error: `You already have access covering these dates (${covered.fromDate} – ${covered.toDate}).` },
        { status: 409 },
      );
    }
  }

  const request = await prisma.accessRequest.create({
    data: {
      employeeId: user.employee.id,
      fromDate: body.fromDate ?? null,
      toDate: body.toDate ?? null,
      note: body.note ?? null,
    },
  });

  // Notify the full admin group of the new request. (The bell hides these admin
  // notifications outside admin view, so a multi-role account won't see them as staff.)
  const admins = await prisma.user.findMany({
    where: { roles: { hasSome: ["ADMIN", "HR", "MANAGER"] } },
    select: { id: true },
  });
  const windowText =
    request.fromDate && request.toDate
      ? ` for ${fmtDate(request.fromDate)} – ${fmtDate(request.toDate)}`
      : "";
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: "Woods Square Access request",
        message: `${user.employee!.name} requested building access${windowText}.`,
        type: "WOODS_SQUARE_REQUEST",
        link: "/woods-square?tab=requests",
      })),
    });
  }

  return NextResponse.json({ ok: true, request });
}

// Admin lists pending requests for the Woods Square page.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.accessRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      employee: { select: { id: true, name: true, email: true, user: { select: { roles: true } } } },
    },
  });
  const requests = rows.map((r) => ({
    ...r,
    employee: {
      id: r.employee.id,
      name: r.employee.name,
      email: r.employee.email,
      roles: r.employee.user.roles,
    },
  }));

  return NextResponse.json({ requests });
}
