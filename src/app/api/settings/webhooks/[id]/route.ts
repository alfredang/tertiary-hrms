import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  return session?.user && session.user.role === "ADMIN";
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { name, description, httpMethod, authToken, enabled } = await req.json();
  if (httpMethod && httpMethod !== "GET" && httpMethod !== "POST") {
    return NextResponse.json({ error: "httpMethod must be GET or POST" }, { status: 400 });
  }
  const row = await prisma.webhook.update({
    where: { id },
    data: {
      ...(typeof name === "string" ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(httpMethod ? { httpMethod } : {}),
      ...(authToken !== undefined ? { authToken: authToken || null } : {}),
      ...(typeof enabled === "boolean" ? { enabled } : {}),
    },
  });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // PATCH is identical to PUT here — used by the panel for toggling enabled.
  return PUT(req, ctx);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.webhook.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
