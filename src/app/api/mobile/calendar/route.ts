import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/calendar — holidays + the user's own events + their approved leave.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const [holidays, ownEvents] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { type: "HOLIDAY" }, orderBy: { startDate: "asc" } }),
    ctx.userId
      ? prisma.calendarEvent.findMany({
          where: { createdById: ctx.userId, type: { in: ["MEETING", "TRAINING", "COMPANY_EVENT"] } },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // The user's approved leave, surfaced on the calendar.
  let leaveEvents: { id: string; title: string; startDate: Date; endDate: Date; allDay: boolean; type: string; color: string | null; description: string | null }[] = [];
  if (ctx.employeeId) {
    const approved = await prisma.leaveRequest.findMany({
      where: { employeeId: ctx.employeeId, status: "APPROVED" },
      select: { id: true },
    });
    const ids = new Set(approved.map((r) => r.id));
    if (ids.size) {
      const all = await prisma.calendarEvent.findMany({
        where: { type: "LEAVE", leaveRequestId: { not: null } },
        orderBy: { startDate: "asc" },
      });
      leaveEvents = all.filter((e) => e.leaveRequestId && ids.has(e.leaveRequestId));
    }
  }

  const merged = [...holidays, ...ownEvents, ...leaveEvents];
  const seen = new Set<string>();
  const events = merged
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map((e) => ({
      id: e.id,
      title: e.title,
      startDate: iso(e.startDate),
      endDate: iso(e.endDate),
      allDay: e.allDay,
      type: e.type,
      color: e.color,
      description: e.description,
    }))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  return NextResponse.json({ events });
}
