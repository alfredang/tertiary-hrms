import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";

// Employees cancel their own pending request; admins may cancel any.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const request = await prisma.timeOffRequest.findUnique({ where: { id } });

    if (!request) {
      return NextResponse.json({ error: "Time off request not found" }, { status: 404 });
    }

    const isOwner = request.employeeId === session.user.employeeId;
    if (!isOwner && !hasAdminAccess(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (request.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only a pending request can be cancelled" },
        { status: 400 }
      );
    }

    const updated = await prisma.timeOffRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error cancelling time off:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
