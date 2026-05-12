import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { generateEndpointToken } from "@/lib/webhooks";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  return session?.user && session.user.role === "ADMIN";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await prisma.webhook.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, description, httpMethod, authToken, enabled } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (httpMethod !== "GET" && httpMethod !== "POST") {
    return NextResponse.json({ error: "httpMethod must be GET or POST" }, { status: 400 });
  }
  const row = await prisma.webhook.create({
    data: {
      name: name.trim(),
      description: description ?? null,
      httpMethod,
      authToken: authToken ?? null,
      enabled: enabled !== false,
      endpointToken: generateEndpointToken(),
    },
  });
  return NextResponse.json(row, { status: 201 });
}
