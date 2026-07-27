import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatTime12h } from "@/lib/time-off";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason: string | undefined = body?.reason?.trim() || undefined;

    const request = await prisma.timeOffRequest.findUnique({
      where: { id },
      include: { employee: { select: { userId: true } } },
    });

    if (!request) {
      return NextResponse.json({ error: "Time off request not found" }, { status: 404 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Time off request is not pending" }, { status: 400 });
    }

    const updated = await prisma.timeOffRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: session.user.employeeId,
        rejectedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    try {
      const when = `${request.date.toISOString().slice(0, 10)}, ${formatTime12h(request.startTime)}–${formatTime12h(request.endTime)}`;
      let msg = `Your time off request (${when}) has been rejected.`;
      if (reason) msg += ` Reason: ${reason}`;
      await prisma.notification.create({
        data: {
          userId: request.employee.userId,
          title: "Time Off Rejected",
          message: msg,
          type: "TIME_OFF_REJECTED",
          link: "/time-off",
        },
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error rejecting time off:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
