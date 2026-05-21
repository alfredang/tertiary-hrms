import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Called by the reference project (AI-LMS-TMS) whenever it rotates the QB refresh token.
// Keeps the HRMS credential table in sync so both apps always have the latest token.
export async function POST(req: NextRequest) {
  const secret = process.env.TOKEN_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "TOKEN_SYNC_SECRET not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";
  if (!refreshToken) {
    return NextResponse.json({ error: "refreshToken required" }, { status: 400 });
  }

  await prisma.companyCredential.upsert({
    where: { keyName: "QUICKBOOKS_REFRESH_TOKEN" },
    update: { keyValue: refreshToken },
    create: { keyName: "QUICKBOOKS_REFRESH_TOKEN", keyValue: refreshToken },
  });

  return NextResponse.json({ ok: true });
}
