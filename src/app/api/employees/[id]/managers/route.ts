import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["ADMIN", "HR"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { id } = await params;
  const body = await req.json();
  const managerIds = Array.isArray(body.managerIds) ? body.managerIds.filter((x: unknown) => typeof x === "string") : null;
  if (!managerIds) {
    return NextResponse.json({ error: "managerIds must be a string array" }, { status: 400 });
  }
  // Disallow self-assignment
  const cleaned = managerIds.filter((mid: string) => mid !== id);

  // Verify each id exists
  if (cleaned.length > 0) {
    const found = await prisma.employee.findMany({
      where: { id: { in: cleaned } },
      select: { id: true },
    });
    if (found.length !== cleaned.length) {
      return NextResponse.json({ error: "One or more manager IDs not found" }, { status: 400 });
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { managerIds: cleaned },
    select: { id: true, managerIds: true },
  });
  return NextResponse.json(updated);
}
