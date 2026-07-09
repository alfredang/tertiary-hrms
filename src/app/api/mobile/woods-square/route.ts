import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/woods-square — the signed-in employee's own building-access
// invites (sent by HR) and access requests. Mirrors the staff-facing
// woods-square-access page's Prisma queries exactly.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ invites: [], requests: [] });

  const employeeId = ctx.employeeId;

  const [invites, requests] = await Promise.all([
    prisma.habitapInviteLog.findMany({
      where: {
        status: "SENT",
        OR: [{ employeeId }, { email: ctx.email }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, fromDate: true, toDate: true, createdAt: true, status: true },
    }),
    prisma.accessRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, fromDate: true, toDate: true, note: true, status: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    invites: invites.map((i) => ({
      id: i.id,
      fromDate: i.fromDate,
      toDate: i.toDate,
      createdAt: iso(i.createdAt),
      status: i.status,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      fromDate: r.fromDate,
      toDate: r.toDate,
      note: r.note,
      status: r.status,
      createdAt: iso(r.createdAt),
    })),
  });
}
