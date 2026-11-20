import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPaybackDecisionEmail } from "@/lib/decision-email";
import { decidePayback } from "@/lib/npl-payback-store";

// Same approvers as leave and time off.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const comment: string | undefined = body?.approvalComment?.trim() || undefined;

    const payback = await prisma.nplPayback.findUnique({ where: { id }, include: { leaveRequest: { select: { status: true } } } });
    if (!payback) return NextResponse.json({ error: "Payback request not found" }, { status: 404 });
    if (payback.status !== "PENDING") return NextResponse.json({ error: "Payback request is not pending" }, { status: 400 });
    if (payback.leaveRequest.status !== "APPROVED") {
      return NextResponse.json({ error: "The No Pay Leave this pays back is no longer approved, so there is nothing to pay back." }, { status: 400 });
    }

    const done = await decidePayback(id, "APPROVED", { approverId: session.user.employeeId, comment });
    if (!done) return NextResponse.json({ error: "Payback request is not pending" }, { status: 400 });

    // In-app notification (and phone push) + email to the requester, Cc both admins.
    await sendPaybackDecisionEmail(id, "APPROVED", { approverName: session.user.name, comment });

    return NextResponse.json({ id, status: "APPROVED" });
  } catch (error) {
    console.error("Error: payback could not be approved:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
