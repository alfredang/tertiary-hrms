import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getCurrentUser() {
  const email = isDevAuthSkipped() ? "admin@tertiaryinfotech.com" : (await auth())?.user?.email;
  if (!email) return null;
  return prisma.user.findUnique({ where: { email }, include: { employee: true } });
}

// Admin declines a pending request → notifies the requester.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const isAdmin = isDevAuthSkipped() || (user?.roles ?? []).some((r) => hasAdminAccess(r));
  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (body.status !== "DECLINED") {
    return NextResponse.json({ error: "Only DECLINED is supported here." }, { status: 400 });
  }

  const existing = await prisma.accessRequest.findUnique({
    where: { id: params.id },
    include: { employee: { select: { userId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending requests can be declined." }, { status: 400 });
  }

  await prisma.accessRequest.update({
    where: { id: params.id },
    data: { status: "DECLINED", resolvedAt: new Date(), resolvedById: user.id },
  });

  await prisma.notification.create({
    data: {
      userId: existing.employee.userId,
      title: "Woods Square Access Declined",
      message: "Your building-access request was declined. Contact an admin for details.",
      type: "INFO",
      link: "/profile",
    },
  });

  return NextResponse.json({ ok: true });
}

// The requester withdraws their own pending request.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.employee) {
    return NextResponse.json({ error: "No employee profile found." }, { status: 400 });
  }

  const row = await prisma.accessRequest.findUnique({
    where: { id: params.id },
    select: { employeeId: true, status: true },
  });
  if (!row || row.employeeId !== user.employee.id) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending requests can be cancelled." }, { status: 400 });
  }

  await prisma.accessRequest.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
