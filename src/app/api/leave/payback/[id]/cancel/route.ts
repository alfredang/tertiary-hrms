import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { sendPaybackCancelledEmail } from "@/lib/approval-email";

// The requester cancels their own pending payback. An admin may cancel any pending one, and may
// also withdraw an approved one (the No Pay Leave day then counts as taken again).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const payback = await prisma.nplPayback.findUnique({ where: { id }, include: { employee: { select: { userId: true, name: true } } } });
    if (!payback) return NextResponse.json({ error: "Payback request not found" }, { status: 404 });

    const isOwner = payback.employeeId === session.user.employeeId;
    const isAdmin = hasAdminAccess(session.user.role);
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const withdrawing = payback.status === "APPROVED";
    if (payback.status !== "PENDING" && !(withdrawing && isAdmin)) {
      return NextResponse.json({ error: "Only a pending payback can be cancelled" }, { status: 400 });
    }

    const res = await prisma.nplPayback.updateMany({ where: { id, status: payback.status }, data: { status: "CANCELLED" } });
    if (res.count === 0) return NextResponse.json({ error: "This payback has just been changed. Refresh and try again." }, { status: 409 });

    // A pending request the approvers were emailed about: tell them it is gone (23 Nov 2026).
    if (!withdrawing) {
      try {
        await sendPaybackCancelledEmail({
          employeeId: payback.employeeId,
          employeeName: payback.employee.name,
          nplDate: payback.nplDate.toISOString().slice(0, 10),
          workDate: payback.workDate.toISOString().slice(0, 10),
          days: Number(payback.days),
        });
      } catch (err) {
        console.error("Failed to send payback cancelled email:", err);
      }
    }

    if (withdrawing && !isOwner) {
      try {
        await prisma.notification.create({
          data: {
            userId: payback.employee.userId,
            title: "Payback Withdrawn",
            message: `Your approved No Pay Leave payback (worked ${payback.workDate.toISOString().slice(0, 10)}) was withdrawn by ${session.user.name ?? "an admin"}. That No Pay Leave day counts as taken again.`,
            type: "PAYBACK_WITHDRAWN",
            link: "/leave/payback",
          },
        });
      } catch {
        // Non-critical
      }
    }
    return NextResponse.json({ id, status: "CANCELLED" });
  } catch (error) {
    console.error("Error cancelling payback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
