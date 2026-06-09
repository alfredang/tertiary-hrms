import { NextRequest, NextResponse } from "next/server";
import { format, parse, parseISO } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";

export const dynamic = "force-dynamic";

/** Resolve the signed-in user (with their employee + role). */
async function getCurrentUser() {
  const email = isDevAuthSkipped() ? "admin@tertiaryinfotech.com" : (await auth())?.user?.email;
  if (!email) return null;
  return prisma.user.findUnique({ where: { email }, include: { employee: true } });
}

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

  const body = (await req.json().catch(() => ({}))) as {
    fromDate?: string;
    toDate?: string;
    note?: string;
  };

  const existing = await prisma.accessRequest.findFirst({
    where: { employeeId: user.employee.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending request." }, { status: 409 });
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
      fromDate: body.fromDate?.trim() || null,
      toDate: body.toDate?.trim() || null,
      note: body.note?.trim() || null,
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
        link: "/woods-square",
      })),
    });
  }

  return NextResponse.json({ ok: true, request });
}

// Admin lists pending requests for the Woods Square page.
export async function GET() {
  const user = await getCurrentUser();
  const isAdmin = isDevAuthSkipped() || (user?.roles ?? []).some((r) => hasAdminAccess(r));
  if (!user || !isAdmin) {
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
