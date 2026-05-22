import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { isDevAuthSkipped } from "@/lib/dev-auth";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const leaveTypes = await prisma.leaveType.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(leaveTypes);
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, defaultDays, internDefaultDays, carryOver, maxCarryOver } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof defaultDays === "number" && defaultDays >= 0) data.defaultDays = defaultDays;
  if (typeof internDefaultDays === "number" && internDefaultDays >= 0) data.internDefaultDays = internDefaultDays;
  if (typeof carryOver === "boolean") data.carryOver = carryOver;
  if (typeof maxCarryOver === "number" && maxCarryOver >= 0) data.maxCarryOver = maxCarryOver;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.leaveType.update({ where: { id }, data });
  return NextResponse.json(updated);
}
