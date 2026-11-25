import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pickRelevant, requestAction, requestIdFromLink, REQUEST_TYPES, type RequestType } from "@/lib/notification-relevance";
import { hasAdminAccess } from "@/lib/utils";
import { ensurePaybackNotices } from "@/lib/npl-payback-store";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const approver = hasAdminAccess(session.user.role);
  // Approvers: a pending payback whose notice is missing gets it back (23 Nov 2026).
  if (approver) await ensurePaybackNotices(session.user.id);

  // Only what is still relevant (src/lib/notification-relevance.ts): no decided requests, no
  // superseded roll-ups, no repeats, nothing older than 30 days. The web bell then filters by view.
  const rows = await prisma.notification.findMany({
    where: { userId: session.user.id, createdAt: { gte: new Date(Date.now() - 31 * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  const wanted: Record<RequestType, string[]> = {
    LEAVE_SUBMITTED: [], TIME_OFF_SUBMITTED: [], EXPENSE_SUBMITTED: [], PAYBACK_SUBMITTED: [], ATTENDANCE_CORRECTION_SUBMITTED: [],
  };
  for (const n of rows) {
    const id = requestIdFromLink(n.link);
    if (id && (REQUEST_TYPES as readonly string[]).includes(n.type)) wanted[n.type as RequestType].push(id);
  }
  const pendingIds = async (find: () => Promise<{ id: string }[]>, ids: string[]) =>
    ids.length ? new Set((await find().catch(() => ids.map((id) => ({ id })))).map((r) => r.id)) : new Set<string>();
  const [leave, timeOff, expense, payback, correction] = await Promise.all([
    pendingIds(() => prisma.leaveRequest.findMany({ where: { id: { in: wanted.LEAVE_SUBMITTED }, status: "PENDING" }, select: { id: true } }), wanted.LEAVE_SUBMITTED),
    pendingIds(() => prisma.timeOffRequest.findMany({ where: { id: { in: wanted.TIME_OFF_SUBMITTED }, status: "PENDING" }, select: { id: true } }), wanted.TIME_OFF_SUBMITTED),
    pendingIds(() => prisma.expenseClaim.findMany({ where: { id: { in: wanted.EXPENSE_SUBMITTED }, status: "PENDING" }, select: { id: true } }), wanted.EXPENSE_SUBMITTED),
    pendingIds(() => prisma.nplPayback.findMany({ where: { id: { in: wanted.PAYBACK_SUBMITTED }, status: "PENDING" }, select: { id: true } }), wanted.PAYBACK_SUBMITTED),
    pendingIds(() => prisma.attendanceCorrection.findMany({ where: { id: { in: wanted.ATTENDANCE_CORRECTION_SUBMITTED }, status: "PENDING" }, select: { id: true } }), wanted.ATTENDANCE_CORRECTION_SUBMITTED),
  ]);
  const sets: Record<RequestType, Set<string>> = {
    LEAVE_SUBMITTED: leave, TIME_OFF_SUBMITTED: timeOff, EXPENSE_SUBMITTED: expense, PAYBACK_SUBMITTED: payback,
    ATTENDANCE_CORRECTION_SUBMITTED: correction,
  };

  // Approvers can act on a request notice itself: `action` names the request (web bell and both
  // apps show Approve / Reject on it). Others get `action: null`.
  return NextResponse.json(
    pickRelevant(rows, (type, id) => sets[type].has(id)).map((n) => ({ ...n, action: approver ? requestAction(n) : null })),
  );
}
