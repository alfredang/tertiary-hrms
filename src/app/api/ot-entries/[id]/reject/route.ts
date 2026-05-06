import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "HR", "MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { reason } = body;

  const entry = await prisma.otEntry.findUnique({
    where: { id },
    include: { employee: { include: { user: true } } },
  });
  if (!entry) return NextResponse.json({ error: "OT entry not found" }, { status: 404 });
  if (entry.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Entry is not pending approval" }, { status: 400 });
  }

  const updated = await prisma.otEntry.update({
    where: { id },
    data: {
      status: "REJECTED",
      approverId: session.user.employeeId ?? null,
      rejectedAt: new Date(),
      rejectionReason: reason ?? null,
    },
  });

  // Notify the employee
  if (entry.employee.user) {
    await prisma.notification.create({
      data: {
        userId: entry.employee.user.id,
        title: "OT Leave Rejected",
        message: `Your overtime work on ${new Date(entry.date).toLocaleDateString("en-SG")} was not approved.${reason ? ` Reason: ${reason}` : ""}`,
        type: "OT_REJECTED",
        link: "/attendance",
      },
    });
  }

  return NextResponse.json(updated);
}
