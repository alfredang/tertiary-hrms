import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const ALLOWED_KEYS = [
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "QUICKBOOKS_REFRESH_TOKEN",
  "QUICKBOOKS_REALM_ID",
  "GMAIL_EMAIL_USER",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: [...ALLOWED_KEYS] } },
  });

  const credentials: Record<string, string> = {};
  for (const row of rows) credentials[row.keyName] = row.keyValue;

  return NextResponse.json(credentials);
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: Record<string, string> = await req.json();

  for (const [keyName, keyValue] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(keyName as AllowedKey)) continue;
    const value = typeof keyValue === "string" ? keyValue.trim() : "";
    if (!value) continue;
    await prisma.companyCredential.upsert({
      where: { keyName },
      update: { keyValue: value },
      create: { keyName, keyValue: value },
    });
  }

  return NextResponse.json({ ok: true });
}
